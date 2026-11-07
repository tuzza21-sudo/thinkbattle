-- Apply after 20261210000000_lounge_call_usage.sql (it needs 20261030000000_lounge_beta_limits.sql too).
-- (2026-11-07) Who the monthly minutes of voice calls bind:
--  * the super admin (the email account piorne@naver.com and the Kakao account of the same person, as is_super_admin()
--    knows them) and the beta testers chosen in the admin page: never;
--  * a member with a paid plan: the plan's minutes (Plus 60, Pro 120);
--  * a member without a plan who signed up before this file was first run: not (the members of the beta stay as they are);
--  * a member without a plan who signs up after it: the free minutes (5 a month, LOUNGE_FREE_CALL_MINUTES).
-- lounge_call_status now says which of these a member is (exempt), and the administrator's list shows it.
BEGIN;

-- applies_from is set once, the first time this runs: everyone who signed up before then is not held to the free minutes.
CREATE TABLE IF NOT EXISTS public.lounge_call_limits(
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  applies_from timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.lounge_call_limits(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.lounge_call_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_call_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lounge_call_limits TO service_role;

-- true: no limit on this member's calls.
CREATE OR REPLACE FUNCTION public.lounge_call_exempt(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p_user = 'd8771e72-7ae4-4402-b8cc-dc52e13bebff'::uuid
    OR EXISTS (SELECT 1 FROM auth.users a WHERE a.id = p_user AND lower(coalesce(a.email, '')) = 'piorne@naver.com')
    OR EXISTS (SELECT 1 FROM public.lounge_beta_testers t WHERE t.user_id = p_user)
    OR (public.lounge_active_plan(p_user) IS NULL
        AND EXISTS (SELECT 1 FROM auth.users a, public.lounge_call_limits l WHERE a.id = p_user AND a.created_at < l.applies_from))
$$;

-- This month's seconds of calls, the plan, and whether no limit applies: { seconds, plan, exempt }.
CREATE OR REPLACE FUNCTION public.lounge_call_status(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'seconds', coalesce((SELECT seconds FROM public.lounge_call_usage WHERE user_id = p_user AND month = public.lounge_speech_month()), 0),
    'plan', public.lounge_active_plan(p_user),
    'exempt', public.lounge_call_exempt(p_user))
$$;

-- The administrator's list, with who is exempt.
CREATE OR REPLACE FUNCTION public.admin_list_lounge_usage(p_month date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE m date := coalesce(date_trunc('month', p_month)::date, public.lounge_speech_month());
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN jsonb_build_object('month', m, 'members', coalesce((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.seconds DESC, r.credits DESC) FROM (
      SELECT u.id AS user_id, u.nickname, u.email, public.lounge_active_plan(u.id) AS plan, public.lounge_call_exempt(u.id) AS exempt,
        coalesce(c.seconds, 0) AS seconds, coalesce(s.chars, 0) AS credits
      FROM public.users u
      LEFT JOIN public.lounge_call_usage c ON c.user_id = u.id AND c.month = m
      LEFT JOIN (SELECT user_id, sum(chars)::integer AS chars FROM public.lounge_speech_usage WHERE month = m GROUP BY user_id) s ON s.user_id = u.id
      WHERE c.user_id IS NOT NULL OR s.user_id IS NOT NULL
      LIMIT 500
    ) r), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.lounge_call_exempt(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lounge_call_exempt(uuid) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
