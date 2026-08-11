-- ThinkFit 개발자 슈퍼 관리자. Supabase SQL Editor에서 실행하세요.
-- 프런트엔드의 이메일 비교와 별개로, 아래 RPC가 서버 측에서 다시 이메일을 검증합니다.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', '')) = 'piorne@naver.com';
$$;

CREATE OR REPLACE FUNCTION public.get_super_admin_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH record_rows AS (
    SELECT
      r.id, r.user_id, r.topic, r.debate_level, r.created_at,
      u.nickname, u.email, r.arguments,
      COALESCE(r.final_report -> 'report', r.final_report) AS report,
      COALESCE((r.final_report -> 'report' ->> 'totalScore')::NUMERIC, (r.final_report ->> 'totalScore')::NUMERIC, 0)::INT AS total_score
    FROM public.debate_records r
    JOIN public.users u ON u.id = r.user_id
    ORDER BY r.created_at DESC
  ), organization_rows AS (
    SELECT
      o.id,
      o.name,
      o.created_at,
      (SELECT COUNT(*)::INT
       FROM public.organization_memberships member
       WHERE member.organization_id = o.id) AS member_count,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'userId', owner_user.id,
          'nickname', owner_user.nickname,
          'email', owner_user.email
        ) ORDER BY owner_user.nickname, owner_user.email)
        FROM public.organization_memberships owner_membership
        JOIN public.users owner_user ON owner_user.id = owner_membership.user_id
        WHERE owner_membership.organization_id = o.id
          AND owner_membership.role = 'owner'
      ), '[]'::jsonb) AS owners
    FROM public.organizations o
  )
  SELECT jsonb_build_object(
    'totalUsers', (SELECT COUNT(*)::INT FROM public.users),
    'totalRecords', (SELECT COUNT(*)::INT FROM public.debate_records),
    'activeUsers', (SELECT COUNT(DISTINCT user_id)::INT FROM public.debate_records),
    'organizations', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'createdAt', created_at,
      'memberCount', member_count,
      'owners', owners
    ) ORDER BY created_at DESC) FROM organization_rows), '[]'::jsonb),
    'records', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'topic', topic,
      'userId', user_id,
      'nickname', nickname,
      'email', email,
      'debateLevel', debate_level,
      'completedAt', created_at,
      'totalScore', total_score,
      'report', report,
      'arguments', arguments
    )) FROM record_rows), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_create_organization(p_name TEXT, p_owner_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  organization_name TEXT := trim(COALESCE(p_name, ''));
  normalized_email TEXT := lower(trim(COALESCE(p_owner_email, '')));
  owner_user_id UUID;
  owner_nickname TEXT;
  owner_email TEXT;
  new_organization_id UUID;
  new_created_at TIMESTAMPTZ;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF organization_name = '' THEN
    RAISE EXCEPTION 'organization name is required';
  END IF;
  IF normalized_email = '' THEN
    RAISE EXCEPTION 'owner email is required';
  END IF;

  SELECT id, nickname, email
  INTO owner_user_id, owner_nickname, owner_email
  FROM public.users
  WHERE lower(email) = normalized_email
  LIMIT 1;

  IF owner_user_id IS NULL THEN
    RAISE EXCEPTION 'owner account not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organizations
    WHERE lower(trim(name)) = lower(organization_name)
  ) THEN
    RAISE EXCEPTION 'organization already exists';
  END IF;

  INSERT INTO public.organizations (name)
  VALUES (organization_name)
  RETURNING id, created_at INTO new_organization_id, new_created_at;

  INSERT INTO public.organization_memberships (organization_id, user_id, role)
  VALUES (new_organization_id, owner_user_id, 'owner')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner';

  RETURN jsonb_build_object(
    'id', new_organization_id,
    'name', organization_name,
    'createdAt', new_created_at,
    'memberCount', 1,
    'owners', jsonb_build_array(jsonb_build_object(
      'userId', owner_user_id,
      'nickname', owner_nickname,
      'email', owner_email
    ))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_add_organization_owner(p_organization_id UUID, p_owner_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_email TEXT := lower(trim(COALESCE(p_owner_email, '')));
  owner_user_id UUID;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  SELECT id INTO owner_user_id
  FROM public.users
  WHERE lower(email) = normalized_email
  LIMIT 1;

  IF owner_user_id IS NULL THEN
    RAISE EXCEPTION 'owner account not found';
  END IF;

  INSERT INTO public.organization_memberships (organization_id, user_id, role)
  VALUES (p_organization_id, owner_user_id, 'owner')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner';
END;
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_super_admin_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.super_admin_create_organization(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.super_admin_add_organization_owner(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_super_admin_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_create_organization(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_add_organization_owner(UUID, TEXT) TO authenticated;
