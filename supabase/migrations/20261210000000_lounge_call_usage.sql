-- (2026-11-07) Minutes a member has spent in voice calls, by month in Korea, and the administrator's view of every
-- member's use (minutes and premium-voice credits together).
-- A call is timed by the page's ticks (api/lounge.ts, action 'call-tick'): the server adds the time since the member's
-- last tick, never more than a minute at once, and nothing when the last tick is old (a call that dropped is not
-- counted as time spent). The plan (Plus 60 minutes a month, Pro 120) comes from lounge_payments.
-- Apply after 20261209000000_lounge_payments.sql and 20261111000000_lounge_speech_usage.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lounge_call_usage(
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month date NOT NULL,
  seconds integer NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  last_tick_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month)
);
CREATE INDEX IF NOT EXISTS lounge_call_usage_month_idx ON public.lounge_call_usage(month, seconds DESC);
ALTER TABLE public.lounge_call_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_call_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lounge_call_usage TO service_role;

-- The plan a member is on now: the paid plan whose month has not ended (Pro over Plus), or null.
CREATE OR REPLACE FUNCTION public.lounge_active_plan(p_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT plan FROM public.lounge_payments
  WHERE user_id = p_user AND status = 'paid' AND period_end > now()
  ORDER BY CASE plan WHEN 'pro' THEN 0 ELSE 1 END, period_end DESC
  LIMIT 1
$$;

-- This month's seconds of calls and the plan: { seconds, plan }.
CREATE OR REPLACE FUNCTION public.lounge_call_status(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'seconds', coalesce((SELECT seconds FROM public.lounge_call_usage WHERE user_id = p_user AND month = public.lounge_speech_month()), 0),
    'plan', public.lounge_active_plan(p_user))
$$;

-- One tick of a call. The first tick of a call (p_start) only starts the clock; later ones add the time since the last
-- tick (at most 60 seconds, and only when that tick was within 90 seconds). Returns the same as lounge_call_status.
CREATE OR REPLACE FUNCTION public.tick_lounge_call(p_user uuid, p_start boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m date := public.lounge_speech_month(); previous timestamptz; added integer := 0;
BEGIN
  INSERT INTO public.lounge_call_usage(user_id, month) VALUES (p_user, m) ON CONFLICT (user_id, month) DO NOTHING;
  SELECT last_tick_at INTO previous FROM public.lounge_call_usage WHERE user_id = p_user AND month = m FOR UPDATE;
  IF NOT coalesce(p_start, false) AND previous IS NOT NULL AND now() - previous <= interval '90 seconds' THEN
    added := least(60, greatest(0, floor(extract(epoch FROM now() - previous))::integer));
  END IF;
  UPDATE public.lounge_call_usage SET seconds = seconds + added, last_tick_at = now(), updated_at = now() WHERE user_id = p_user AND month = m;
  RETURN public.lounge_call_status(p_user);
END $$;

-- The administrator's list for a month (the first day of it; null = this month): every member who called or had a
-- premium voice spoken, with the plan, seconds of calls and premium-voice characters (ElevenLabs credits, one per character).
CREATE OR REPLACE FUNCTION public.admin_list_lounge_usage(p_month date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE m date := coalesce(date_trunc('month', p_month)::date, public.lounge_speech_month());
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN jsonb_build_object('month', m, 'members', coalesce((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.seconds DESC, r.credits DESC) FROM (
      SELECT u.id AS user_id, u.nickname, u.email, public.lounge_active_plan(u.id) AS plan,
        coalesce(c.seconds, 0) AS seconds, coalesce(s.chars, 0) AS credits
      FROM public.users u
      LEFT JOIN public.lounge_call_usage c ON c.user_id = u.id AND c.month = m
      LEFT JOIN (SELECT user_id, sum(chars)::integer AS chars FROM public.lounge_speech_usage WHERE month = m GROUP BY user_id) s ON s.user_id = u.id
      WHERE c.user_id IS NOT NULL OR s.user_id IS NOT NULL
      LIMIT 500
    ) r), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.lounge_active_plan(uuid), public.lounge_call_status(uuid), public.tick_lounge_call(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lounge_active_plan(uuid), public.lounge_call_status(uuid), public.tick_lounge_call(uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.admin_list_lounge_usage(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_lounge_usage(date) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
