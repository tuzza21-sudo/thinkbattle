-- Characters a member has had spoken in a premium voice engine (ElevenLabs, Typecast), by month in Korea. The API keeps a
-- monthly allowance per member and per engine from it (api/lounge.ts; the limits are environment variables).

CREATE TABLE IF NOT EXISTS public.lounge_speech_usage(
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month date NOT NULL,
  engine text NOT NULL CHECK (engine ~ '^[a-z0-9-]{1,32}$'),
  chars integer NOT NULL DEFAULT 0 CHECK (chars >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month, engine)
);
CREATE INDEX IF NOT EXISTS lounge_speech_usage_month_engine_idx ON public.lounge_speech_usage(month, engine);
ALTER TABLE public.lounge_speech_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_speech_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lounge_speech_usage TO service_role;

-- The first day of the current month in Korea.
CREATE OR REPLACE FUNCTION public.lounge_speech_month() RETURNS date
LANGUAGE sql STABLE SET search_path=public AS $$ SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Seoul')::date $$;

-- What a member and everyone together have had spoken in an engine this month: { member, total } in characters.
CREATE OR REPLACE FUNCTION public.lounge_speech_usage_status(p_user uuid, p_engine text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'member', coalesce(sum(chars) FILTER (WHERE user_id = p_user), 0),
    'total', coalesce(sum(chars), 0)
  ) FROM public.lounge_speech_usage WHERE month = public.lounge_speech_month() AND engine = p_engine
$$;

-- Adds characters spoken to a member's month and returns what the member has used in the engine so far.
CREATE OR REPLACE FUNCTION public.add_lounge_speech_usage(p_user uuid, p_engine text, p_chars integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE used integer;
BEGIN
  IF p_chars IS NULL OR p_chars <= 0 THEN
    SELECT coalesce(sum(chars), 0) INTO used FROM public.lounge_speech_usage WHERE user_id = p_user AND month = public.lounge_speech_month() AND engine = p_engine;
    RETURN used;
  END IF;
  INSERT INTO public.lounge_speech_usage(user_id, month, engine, chars) VALUES (p_user, public.lounge_speech_month(), p_engine, least(p_chars, 20000))
  ON CONFLICT (user_id, month, engine) DO UPDATE SET chars = public.lounge_speech_usage.chars + least(p_chars, 20000), updated_at = now()
  RETURNING chars INTO used;
  RETURN used;
END $$;

REVOKE ALL ON FUNCTION public.lounge_speech_month() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lounge_speech_usage_status(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_lounge_speech_usage(uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lounge_speech_month() TO service_role;
GRANT EXECUTE ON FUNCTION public.lounge_speech_usage_status(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_lounge_speech_usage(uuid,text,integer) TO service_role;
