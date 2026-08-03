-- ThinkFit B2B 기관 관리자 기능. Supabase SQL Editor에서 한 번 실행하세요.
-- 관리자 권한은 로그인 체크박스가 아니라 기관 멤버십 역할로 확인합니다.

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE TABLE IF NOT EXISTS public.organization_memberships (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'coach', 'student')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (organization_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.organization_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (organization_id, name)
);
CREATE TABLE IF NOT EXISTS public.organization_group_students (
  group_id UUID NOT NULL REFERENCES public.organization_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.organization_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_group_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_topics ENABLE ROW LEVEL SECURITY;

-- Make this migration safe to run again after a partial/previous deployment.
DROP POLICY IF EXISTS "Members can read own organizations" ON public.organizations;
DROP POLICY IF EXISTS "Owners manage organizations" ON public.organizations;
DROP POLICY IF EXISTS "Members can read memberships" ON public.organization_memberships;
DROP POLICY IF EXISTS "Staff manage memberships" ON public.organization_memberships;
DROP POLICY IF EXISTS "Staff manage groups" ON public.organization_groups;
DROP POLICY IF EXISTS "Staff manage group students" ON public.organization_group_students;

CREATE OR REPLACE FUNCTION public.is_organization_staff(p_organization_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_memberships WHERE organization_id = p_organization_id AND user_id = auth.uid() AND role IN ('owner', 'admin', 'coach'));
$$;

CREATE POLICY "Members can read own organizations" ON public.organizations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.organization_memberships m WHERE m.organization_id = id AND m.user_id = auth.uid()));
CREATE POLICY "Members can read memberships" ON public.organization_memberships FOR SELECT
  USING (user_id = auth.uid() OR public.is_organization_staff(organization_id));
CREATE POLICY "Staff manage memberships" ON public.organization_memberships FOR ALL
  USING (public.is_organization_staff(organization_id)) WITH CHECK (public.is_organization_staff(organization_id));
CREATE POLICY "Owners manage organizations" ON public.organizations FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.organization_memberships m WHERE m.organization_id = id AND m.user_id = auth.uid() AND m.role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.organization_memberships m WHERE m.organization_id = id AND m.user_id = auth.uid() AND m.role = 'owner'));
CREATE POLICY "Staff manage groups" ON public.organization_groups FOR ALL
  USING (public.is_organization_staff(organization_id)) WITH CHECK (public.is_organization_staff(organization_id));
CREATE POLICY "Staff manage group students" ON public.organization_group_students FOR ALL
  USING (EXISTS (SELECT 1 FROM public.organization_groups g WHERE g.id = group_id AND public.is_organization_staff(g.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.organization_groups g WHERE g.id = group_id AND public.is_organization_staff(g.organization_id)));

CREATE OR REPLACE FUNCTION public.get_my_organizations()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'role', m.role) ORDER BY o.name), '[]'::jsonb)
  FROM public.organization_memberships m JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = auth.uid() AND m.role IN ('owner', 'admin', 'coach');
$$;

-- `piorne@naver.com` is the developer's B2B owner account. This runs only
-- for the authenticated developer account, never from a client-supplied email.
CREATE OR REPLACE FUNCTION public.ensure_developer_b2b_access()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE developer_org_id UUID;
BEGIN
  IF lower(COALESCE(auth.jwt() ->> 'email', '')) <> 'piorne@naver.com' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT organization_id INTO developer_org_id
  FROM public.organization_memberships
  WHERE user_id = auth.uid() AND role = 'owner'
  LIMIT 1;

  IF developer_org_id IS NULL THEN
    INSERT INTO public.organizations (name) VALUES ('ThinkFit 개발자 테스트 기관')
    RETURNING id INTO developer_org_id;
    INSERT INTO public.organization_memberships (organization_id, user_id, role)
    VALUES (developer_org_id, auth.uid(), 'owner');
    INSERT INTO public.organization_groups (organization_id, name)
    VALUES (developer_org_id, '테스트 그룹');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_b2b_dashboard(p_organization_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_organization_staff(p_organization_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  WITH students AS (
    SELECT m.user_id, u.nickname, u.email, COALESCE(array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL), ARRAY[]::TEXT[]) AS groups
    FROM public.organization_memberships m JOIN public.users u ON u.id = m.user_id
    LEFT JOIN public.organization_group_students gs ON gs.user_id = m.user_id
    LEFT JOIN public.organization_groups g ON g.id = gs.group_id AND g.organization_id = p_organization_id
    WHERE m.organization_id = p_organization_id AND m.role = 'student' GROUP BY m.user_id, u.nickname, u.email
  ), records AS (
    SELECT r.* FROM public.debate_records r JOIN students s ON s.user_id = r.user_id
  ), scores AS (
    SELECT r.user_id, category->>'name' AS name, ROUND(((category->>'score')::NUMERIC / NULLIF((category->>'maxScore')::NUMERIC, 0)) * 100)::INT AS score
    FROM records r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.final_report->'report'->'categories', r.final_report->'categories', '[]'::jsonb)) category
  ), student_rows AS (
    SELECT s.*, COUNT(DISTINCT r.id)::INT AS debate_count, COALESCE(ROUND(AVG(sc.score)), 0)::INT AS average_score, MAX(r.created_at) AS last_activity
    FROM students s LEFT JOIN records r ON r.user_id=s.user_id LEFT JOIN scores sc ON sc.user_id=s.user_id
    GROUP BY s.user_id, s.nickname, s.email, s.groups
  ), group_rows AS (
    SELECT g.id, g.name, COUNT(DISTINCT gs.user_id)::INT AS student_count, COUNT(DISTINCT r.id)::INT AS debate_count, COALESCE(ROUND(AVG(sc.score)), 0)::INT AS average_score
    FROM public.organization_groups g LEFT JOIN public.organization_group_students gs ON gs.group_id=g.id LEFT JOIN records r ON r.user_id=gs.user_id LEFT JOIN scores sc ON sc.user_id=gs.user_id
    WHERE g.organization_id=p_organization_id GROUP BY g.id, g.name
  )
  SELECT jsonb_build_object(
    'organization', (SELECT jsonb_build_object('id', o.id, 'name', o.name, 'role', m.role) FROM public.organizations o JOIN public.organization_memberships m ON m.organization_id=o.id WHERE o.id=p_organization_id AND m.user_id=auth.uid()),
    'students', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', user_id, 'nickname', nickname, 'email', email, 'groups', groups, 'debateCount', debate_count, 'averageScore', average_score, 'lastActivity', last_activity, 'levelCounts', '{}'::jsonb) ORDER BY nickname) FROM student_rows), '[]'::jsonb),
    'groups', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'studentCount', student_count, 'debateCount', debate_count, 'averageScore', average_score) ORDER BY name) FROM group_rows), '[]'::jsonb),
    'categoryAverages', COALESCE((SELECT jsonb_object_agg(name, average_score) FROM (SELECT name, ROUND(AVG(score))::INT AS average_score FROM scores GROUP BY name) a), '{}'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organizations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_b2b_dashboard(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_developer_b2b_access() TO authenticated;

-- 기관 운영자가 반과 학생을 관리하는 RPC입니다. 이메일로 사용자를 조회하는
-- 작업은 클라이언트에 회원 목록을 공개하지 않도록 서버 함수에서만 수행합니다.
CREATE OR REPLACE FUNCTION public.create_organization_group(p_organization_id UUID, p_name TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_organization_staff(p_organization_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF length(trim(COALESCE(p_name, ''))) = 0 THEN RAISE EXCEPTION 'group name is required'; END IF;
  INSERT INTO public.organization_groups (organization_id, name) VALUES (p_organization_id, trim(p_name));
END;
$$;

CREATE OR REPLACE FUNCTION public.add_organization_student(p_organization_id UUID, p_email TEXT, p_group_ids UUID[] DEFAULT ARRAY[]::UUID[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user_id UUID;
BEGIN
  IF NOT public.is_organization_staff(p_organization_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT id INTO target_user_id FROM public.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
  IF target_user_id IS NULL THEN RAISE EXCEPTION 'The user must sign up before being added.'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_memberships WHERE organization_id = p_organization_id AND user_id = target_user_id AND role IN ('owner', 'admin', 'coach')) THEN
    RAISE EXCEPTION 'A staff account cannot be changed into a student.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_group_ids, ARRAY[]::UUID[])) group_id LEFT JOIN public.organization_groups g ON g.id = group_id AND g.organization_id = p_organization_id WHERE g.id IS NULL) THEN
    RAISE EXCEPTION 'One or more groups do not belong to this organization.';
  END IF;
  INSERT INTO public.organization_memberships (organization_id, user_id, role) VALUES (p_organization_id, target_user_id, 'student')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'student';
  DELETE FROM public.organization_group_students gs USING public.organization_groups g
  WHERE gs.group_id = g.id AND g.organization_id = p_organization_id AND gs.user_id = target_user_id;
  INSERT INTO public.organization_group_students (group_id, user_id)
  SELECT group_id, target_user_id FROM unnest(COALESCE(p_group_ids, ARRAY[]::UUID[])) group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_organization_student(p_organization_id UUID, p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_organization_staff(p_organization_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  DELETE FROM public.organization_group_students gs USING public.organization_groups g
  WHERE gs.group_id = g.id AND g.organization_id = p_organization_id AND gs.user_id = p_user_id;
  DELETE FROM public.organization_memberships
  WHERE organization_id = p_organization_id AND user_id = p_user_id AND role = 'student';
END;
$$;

-- Only institution staff can retrieve this compact member directory.
CREATE OR REPLACE FUNCTION public.get_organization_user_directory(p_organization_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  IF NOT public.is_organization_staff(p_organization_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', u.id, 'nickname', u.nickname, 'email', u.email) ORDER BY u.nickname, u.email)
    FROM public.users u
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_organization_topics(p_organization_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  IF NOT public.is_organization_staff(p_organization_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'description', description, 'isActive', is_active, 'createdAt', created_at) ORDER BY created_at DESC) FROM public.organization_topics WHERE organization_id = p_organization_id), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_organization_topics()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'description', t.description, 'isActive', t.is_active, 'createdAt', t.created_at) ORDER BY t.created_at DESC), '[]'::jsonb)
  FROM public.organization_topics t WHERE t.is_active AND EXISTS (SELECT 1 FROM public.organization_memberships m WHERE m.organization_id = t.organization_id AND m.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.create_organization_topic(p_organization_id UUID, p_title TEXT, p_description TEXT DEFAULT '')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_organization_staff(p_organization_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF length(trim(COALESCE(p_title, ''))) = 0 THEN RAISE EXCEPTION 'topic title is required'; END IF;
  INSERT INTO public.organization_topics (organization_id, title, description) VALUES (p_organization_id, trim(p_title), trim(COALESCE(p_description, '')));
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_organization_topic(p_organization_id UUID, p_topic_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_organization_staff(p_organization_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  DELETE FROM public.organization_topics WHERE id = p_topic_id AND organization_id = p_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_organization_student_records(p_organization_id UUID, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  IF NOT public.is_organization_staff(p_organization_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_memberships WHERE organization_id = p_organization_id AND user_id = p_user_id) THEN RAISE EXCEPTION 'student is not in this organization'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'topic', r.topic, 'debateLevel', r.debate_level, 'completedAt', r.created_at,
      'totalScore', COALESCE((r.final_report -> 'report' ->> 'totalScore')::INT, (r.final_report ->> 'totalScore')::INT, 0)
    ) ORDER BY r.created_at DESC)
    FROM public.debate_records r WHERE r.user_id = p_user_id
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization_group(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_organization_student(UUID, TEXT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_organization_student(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_user_directory(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_topics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_organization_topics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_topic(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_organization_topic(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_student_records(UUID, UUID) TO authenticated;

-- 예시: INSERT INTO public.organizations (name) VALUES ('ThinkFit 시범 학원') RETURNING id;
-- 이후 organization_memberships에 기관 UUID, 관리자 UUID, 'owner'를 넣어 초대합니다.

-- 기관 전용 주제의 AI 브리핑과 권장 토론 설정. 기존 설치에도 안전하게 적용됩니다.
ALTER TABLE public.organization_topics
  ADD COLUMN IF NOT EXISTS briefing JSONB,
  ADD COLUMN IF NOT EXISTS config JSONB;

CREATE OR REPLACE FUNCTION public.get_my_member_organizations()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'role', m.role) ORDER BY o.name), '[]'::jsonb)
  FROM public.organization_memberships m JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_organization_topics(p_organization_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  IF NOT public.is_organization_staff(p_organization_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'organizationId', organization_id, 'title', title, 'description', description,
    'briefing', briefing, 'config', config, 'isActive', is_active, 'createdAt', created_at
  ) ORDER BY created_at DESC) FROM public.organization_topics WHERE organization_id = p_organization_id), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_organization_topics()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id, 'organizationId', t.organization_id, 'organizationName', o.name,
    'title', t.title, 'description', t.description, 'briefing', t.briefing, 'config', t.config,
    'isActive', t.is_active, 'createdAt', t.created_at
  ) ORDER BY t.created_at DESC), '[]'::jsonb)
  FROM public.organization_topics t JOIN public.organizations o ON o.id = t.organization_id
  WHERE t.is_active AND EXISTS (SELECT 1 FROM public.organization_memberships m WHERE m.organization_id = t.organization_id AND m.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.create_organization_topic(
  p_organization_id UUID, p_title TEXT, p_description TEXT DEFAULT '', p_briefing JSONB DEFAULT NULL, p_config JSONB DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_organization_staff(p_organization_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF length(trim(COALESCE(p_title, ''))) = 0 THEN RAISE EXCEPTION 'topic title is required'; END IF;
  INSERT INTO public.organization_topics (organization_id, title, description, briefing, config)
  VALUES (p_organization_id, trim(p_title), trim(COALESCE(p_description, '')), p_briefing, p_config);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_member_organizations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_topic(UUID, TEXT, TEXT, JSONB, JSONB) TO authenticated;
