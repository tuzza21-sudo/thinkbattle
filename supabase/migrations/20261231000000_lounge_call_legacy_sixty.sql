-- Apply after 20261210060000_lounge_call_testers_limited.sql. Deploy the API change first (it reads `legacy`), then run this.
-- (2026-11-17) Members from before the call limit began, without a plan and not testers, are no longer unlimited in voice
-- calls: 60 minutes a month (LOUNGE_LEGACY_CALL_MINUTES in the API). Only the super admin (piorne@naver.com and the Kakao
-- account of the same person) has no limit. A plan's minutes and a tester's 30 minutes come first, as before.
-- lounge_call_status says { seconds, plan, exempt, tester, legacy }; the administrator's list says who is a legacy member.
BEGIN;

-- A member from before the limit began, with no plan and not a beta tester: 60 minutes.
CREATE OR REPLACE FUNCTION public.lounge_call_legacy(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT NOT public.lounge_call_exempt(p_user)
    AND NOT public.lounge_call_tester(p_user)
    AND public.lounge_active_plan(p_user) IS NULL
    AND EXISTS (SELECT 1 FROM auth.users a, public.lounge_call_limits l WHERE a.id = p_user AND a.created_at < l.applies_from)
$$;

-- true: no limit on this member's calls: the super admin only.
CREATE OR REPLACE FUNCTION public.lounge_call_exempt(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p_user = 'd8771e72-7ae4-4402-b8cc-dc52e13bebff'::uuid
    OR EXISTS (SELECT 1 FROM auth.users a WHERE a.id = p_user AND lower(coalesce(a.email, '')) = 'piorne@naver.com')
$$;

CREATE OR REPLACE FUNCTION public.lounge_call_status(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'seconds', coalesce((SELECT seconds FROM public.lounge_call_usage WHERE user_id = p_user AND month = public.lounge_speech_month()), 0),
    'plan', public.lounge_active_plan(p_user),
    'exempt', public.lounge_call_exempt(p_user),
    'tester', public.lounge_call_tester(p_user),
    'legacy', public.lounge_call_legacy(p_user))
$$;

CREATE OR REPLACE FUNCTION public.admin_list_lounge_usage(p_month date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE m date := coalesce(date_trunc('month', p_month)::date, public.lounge_speech_month());
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN jsonb_build_object('month', m, 'members', coalesce((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.seconds DESC, r.credits DESC) FROM (
      SELECT u.id AS user_id, u.nickname, u.email, public.lounge_active_plan(u.id) AS plan, public.lounge_call_exempt(u.id) AS exempt,
        public.lounge_call_tester(u.id) AS tester, public.lounge_call_legacy(u.id) AS legacy, coalesce(c.seconds, 0) AS seconds, coalesce(s.chars, 0) AS credits
      FROM public.users u
      LEFT JOIN public.lounge_call_usage c ON c.user_id = u.id AND c.month = m
      LEFT JOIN (SELECT user_id, sum(chars)::integer AS chars FROM public.lounge_speech_usage WHERE month = m GROUP BY user_id) s ON s.user_id = u.id
      WHERE c.user_id IS NOT NULL OR s.user_id IS NOT NULL
      LIMIT 500
    ) r), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.lounge_call_legacy(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lounge_call_legacy(uuid) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
