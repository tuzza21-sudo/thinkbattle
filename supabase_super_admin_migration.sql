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
  )
  SELECT jsonb_build_object(
    'totalUsers', (SELECT COUNT(*)::INT FROM public.users),
    'totalRecords', (SELECT COUNT(*)::INT FROM public.debate_records),
    'activeUsers', (SELECT COUNT(DISTINCT user_id)::INT FROM public.debate_records),
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

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_super_admin_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_super_admin_dashboard() TO authenticated;
