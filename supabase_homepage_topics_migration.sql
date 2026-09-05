-- Super-admin managed homepage debate topics.
-- Run after supabase_super_admin_migration.sql.

CREATE TABLE IF NOT EXISTS public.homepage_debate_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_kind TEXT NOT NULL CHECK (topic_kind IN ('latest_issue', 'detail')),
  sector TEXT NOT NULL CHECK (char_length(trim(sector)) BETWEEN 1 AND 40),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  description TEXT NOT NULL CHECK (char_length(trim(description)) BETWEEN 1 AND 3000),
  briefing JSONB NOT NULL CHECK (jsonb_typeof(briefing) = 'object'),
  time_limit INTEGER NOT NULL DEFAULT 600 CHECK (time_limit BETWEEN 300 AND 1200),
  accent TEXT NOT NULL DEFAULT 'cyan' CHECK (accent IN ('cyan', 'amber', 'pink')),
  issue_label TEXT NOT NULL DEFAULT '' CHECK (char_length(issue_label) <= 60),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN -10000 AND 10000),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.homepage_debate_topics ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_homepage_debate_topics_public
  ON public.homepage_debate_topics (topic_kind, is_active, sort_order DESC, updated_at DESC);

ALTER TABLE public.homepage_debate_topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Everyone can read active homepage debate topics" ON public.homepage_debate_topics;
CREATE POLICY "Everyone can read active homepage debate topics"
ON public.homepage_debate_topics FOR SELECT TO anon, authenticated
USING (is_active AND deleted_at IS NULL);

REVOKE ALL ON public.homepage_debate_topics FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_homepage_debate_topics()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'topics', COALESCE((
      SELECT jsonb_agg((to_jsonb(topic_row) - 'created_by' - 'deleted_at') ORDER BY topic_row.topic_kind, topic_row.sort_order DESC, topic_row.updated_at DESC)
      FROM public.homepage_debate_topics topic_row
      WHERE topic_row.is_active AND topic_row.deleted_at IS NULL
    ), '[]'::jsonb),
    'managedKinds', COALESCE((
      SELECT jsonb_agg(kind_row.topic_kind ORDER BY kind_row.topic_kind)
      FROM (SELECT DISTINCT topic_kind FROM public.homepage_debate_topics) kind_row
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_super_admin_homepage_topics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(topic_row) ORDER BY topic_row.topic_kind, topic_row.sort_order DESC, topic_row.updated_at DESC), '[]'::jsonb)
  INTO result
  FROM public.homepage_debate_topics topic_row
  WHERE topic_row.deleted_at IS NULL;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_homepage_debate_topic(
  p_topic_kind TEXT,
  p_sector TEXT,
  p_title TEXT,
  p_description TEXT,
  p_briefing JSONB,
  p_time_limit INTEGER,
  p_accent TEXT,
  p_issue_label TEXT,
  p_sort_order INTEGER,
  p_is_active BOOLEAN,
  p_topic_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE saved_topic public.homepage_debate_topics%ROWTYPE;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_topic_kind NOT IN ('latest_issue', 'detail')
    OR char_length(trim(COALESCE(p_sector, ''))) NOT BETWEEN 1 AND 40
    OR char_length(trim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 160
    OR char_length(trim(COALESCE(p_description, ''))) NOT BETWEEN 1 AND 3000
    OR jsonb_typeof(p_briefing) <> 'object'
    OR COALESCE(p_briefing ->> 'context', '') = ''
    OR p_time_limit NOT BETWEEN 300 AND 1200
    OR p_accent NOT IN ('cyan', 'amber', 'pink')
    OR char_length(COALESCE(p_issue_label, '')) > 60
    OR p_sort_order NOT BETWEEN -10000 AND 10000
  THEN
    RAISE EXCEPTION 'invalid homepage topic';
  END IF;

  IF p_topic_id IS NULL THEN
    INSERT INTO public.homepage_debate_topics (
      topic_kind, sector, title, description, briefing, time_limit,
      accent, issue_label, sort_order, is_active, created_by
    ) VALUES (
      p_topic_kind, trim(p_sector), trim(p_title), trim(p_description), p_briefing,
      p_time_limit, p_accent, trim(COALESCE(p_issue_label, '')), p_sort_order,
      COALESCE(p_is_active, TRUE), auth.uid()
    ) RETURNING * INTO saved_topic;
  ELSE
    UPDATE public.homepage_debate_topics
    SET topic_kind = p_topic_kind,
        sector = trim(p_sector),
        title = trim(p_title),
        description = trim(p_description),
        briefing = p_briefing,
        time_limit = p_time_limit,
        accent = p_accent,
        issue_label = trim(COALESCE(p_issue_label, '')),
        sort_order = p_sort_order,
        is_active = COALESCE(p_is_active, TRUE),
        updated_at = timezone('utc', now())
    WHERE id = p_topic_id
    RETURNING * INTO saved_topic;
    IF saved_topic.id IS NULL THEN RAISE EXCEPTION 'homepage topic not found'; END IF;
  END IF;

  RETURN to_jsonb(saved_topic);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_homepage_debate_topic(p_topic_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.homepage_debate_topics
  SET is_active = FALSE,
      deleted_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  WHERE id = p_topic_id
    AND deleted_at IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.get_homepage_debate_topics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_super_admin_homepage_topics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_homepage_debate_topic(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, TEXT, TEXT, INTEGER, BOOLEAN, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_homepage_debate_topic(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_homepage_debate_topics() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_super_admin_homepage_topics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_homepage_debate_topic(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, TEXT, TEXT, INTEGER, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_homepage_debate_topic(UUID) TO authenticated;

-- Seed the current homepage once so it is editable immediately after deployment.
-- The former featured semiconductor issue now belongs in the Economy detail category.
-- This also restores the row if it was soft-deleted while replacing the featured issue.
UPDATE public.homepage_debate_topics
SET topic_kind = 'detail',
    sector = '경제',
    issue_label = '',
    is_active = TRUE,
    deleted_at = NULL,
    updated_at = timezone('utc', now())
WHERE lower(trim(title)) = lower('반도체 기업의 초과이익은 노동자와 사회에 공유되어야 하는가?');

INSERT INTO public.homepage_debate_topics (
  topic_kind, sector, title, description, briefing, time_limit,
  accent, issue_label, sort_order, is_active
)
SELECT
  seed.topic_kind,
  seed.sector,
  seed.title,
  seed.description,
  jsonb_build_object(
    'context', seed.description,
    'recentCases', '[]'::jsonb,
    'newsLinks', '[]'::jsonb,
    'affirmative', jsonb_build_object('title', '찬성 측 핵심', 'points', to_jsonb(seed.affirmative_points)),
    'negative', jsonb_build_object('title', '반대 측 핵심', 'points', to_jsonb(seed.negative_points)),
    'prepQuestions', '[]'::jsonb,
    'keywords', '[]'::jsonb
  ),
  seed.time_limit,
  seed.accent,
  seed.issue_label,
  seed.sort_order,
  TRUE
FROM (VALUES
  ('detail', '경제', '반도체 기업의 초과이익은 노동자와 사회에 공유되어야 하는가?', '최근 글로벌 반도체 호황과 AI 열풍으로 일부 반도체 기업들이 막대한 초과이익을 달성하고 있습니다. 이러한 이익이 기업의 독자적 성과인지, 국가적 지원과 노동자의 헌신이 낳은 결과물로서 분배되어야 하는지 논의합니다.', 900, 'pink', '', 100,
    ARRAY['기업의 이익은 사회적 인프라, 국가 지원, 노동자의 헌신이 결합된 결과이므로 합당하게 분배되어야 한다.', '초과이익을 사회와 공유하면 양극화를 해소하고 내수 경제 활성화에 기여할 수 있다.']::TEXT[],
    ARRAY['막대한 이익은 기업의 리스크 감수와 혁신 투자의 결과이며, 분배를 강제하면 투자 의욕이 저하된다.', '반도체 산업은 적자 시기를 대비해 이익을 유보해야 글로벌 경쟁력을 유지할 수 있다.']::TEXT[]),
  ('detail', '국제', '다극화 시대의 유엔(UN) 무용론, 해체해야 하는가?', '강대국 간 패권 경쟁 심화로 유엔의 분쟁 조정 능력이 한계를 보이면서 존재 이유와 개혁 방향을 토론합니다.', 600, 'cyan', '', 90,
    ARRAY['강대국 이익 대변 기구로 전락해 평화 유지 기능을 상실했다.', '새로운 다자주의 체제가 필요하다.']::TEXT[],
    ARRAY['완벽하지 않아도 유일한 글로벌 소통 창구다.', '해체하면 강대국 간 힘의 논리만 지배할 수 있다.']::TEXT[]),
  ('detail', '정치', '국회의원 불체포 특권, 전면 폐지해야 하는가?', '정치적 탄압 방지 장치와 법 앞의 평등 사이에서 불체포 특권의 존폐를 토론합니다.', 600, 'amber', '', 80,
    ARRAY['법 앞에 평등해야 하며 범죄 도피처로 악용되는 특권은 폐지해야 한다.', '국민의 정치 불신을 해소하기 위한 필수 조치다.']::TEXT[],
    ARRAY['행정부와 검찰의 부당한 정치 탄압을 막을 최소한의 방패다.', '전면 폐지는 의회의 독립성을 약화할 수 있다.']::TEXT[]),
  ('detail', '경제', '가상자산 제도권 편입, 기존 화폐를 대체할 수 있는가?', '가상자산의 제도권 편입이 가속화되는 상황에서 미래 화폐 시스템과 규제 방향을 토론합니다.', 600, 'cyan', '', 70,
    ARRAY['탈중앙화 기술로 기존 금융 시스템의 비효율성을 줄일 수 있다.', '국경을 넘는 새로운 교환·가치 저장 수단으로 발전할 가능성이 있다.']::TEXT[],
    ARRAY['가격 변동성이 커서 화폐의 기본 기능을 안정적으로 수행하기 어렵다.', '통화 정책과 금융 소비자 보호를 약화할 위험이 있다.']::TEXT[]),
  ('detail', '교육', '공교육 내 AI 튜터 전면 도입, 교사의 역할은 축소될 것인가?', 'AI 튜터 도입에 따른 맞춤형 교육의 효과와 교사의 역할 변화, 기술 의존 위험을 토론합니다.', 600, 'pink', '', 60,
    ARRAY['지식 전달과 반복 학습은 AI가 효율적으로 수행해 교사의 기존 업무 비중이 줄어든다.', '교육 현장의 기술 의존도가 높아지면서 교사의 재량이 축소될 수 있다.']::TEXT[],
    ARRAY['교사는 정서적 교감과 창의성, 공동체 교육을 담당하는 역할로 진화한다.', 'AI는 도구이며 최종적인 교육 판단과 책임은 인간 교사에게 남는다.']::TEXT[]),
  ('detail', '사회', '촉법소년 연령 하향은 정당한가?', '소년 범죄의 책임 강화와 교화 우선 원칙 사이에서 형사책임 연령 조정의 타당성을 토론합니다.', 600, 'pink', '', 50,
    ARRAY['범죄 피해의 심각성에 비해 책임이 약하면 법의 억지력이 떨어진다.', '청소년도 범죄 결과를 예측할 수 있는 정보와 판단 능력이 높아졌다.']::TEXT[],
    ARRAY['어린 나이의 판단 능력과 환경 요인을 고려하면 처벌보다 교화가 우선이다.', '형사처벌의 낙인이 재범과 사회 이탈을 키울 수 있다.']::TEXT[]),
  ('detail', '사회', '동물실험은 계속 허용되어야 하는가?', '의약품 안전 검증의 필요성과 동물권, 대체시험 기술의 발전을 함께 고려해 허용 범위를 토론합니다.', 600, 'cyan', '', 40,
    ARRAY['신약과 백신의 안전성을 검증하려면 아직 생체 반응을 확인할 필요가 있다.', '엄격한 윤리 심사 아래 제한적으로 허용할 수 있다.']::TEXT[],
    ARRAY['동물의 고통을 인간의 이익만으로 정당화하기 어렵다.', '대체시험 기술에 투자해 윤리적 문제를 해결해야 한다.']::TEXT[])
) AS seed(topic_kind, sector, title, description, time_limit, accent, issue_label, sort_order, affirmative_points, negative_points)
WHERE NOT EXISTS (
  SELECT 1 FROM public.homepage_debate_topics existing
  WHERE lower(trim(existing.title)) = lower(trim(seed.title))
    AND existing.topic_kind = seed.topic_kind
);

NOTIFY pgrst, 'reload schema';
