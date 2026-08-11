-- ThinkFit production hardening.
-- Run after the existing schema, B2B, live debate, and topic visibility migrations.

CREATE TABLE IF NOT EXISTS public.ai_api_rate_limits (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 40),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (user_id, bucket)
);

ALTER TABLE public.ai_api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_api_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_ai_api_quota(
  quota_bucket TEXT,
  quota_limit INTEGER,
  quota_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_count INTEGER;
  now_utc TIMESTAMPTZ := timezone('utc', now());
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF quota_bucket !~ '^[a-z0-9:_-]{1,40}$' THEN RAISE EXCEPTION 'invalid quota bucket'; END IF;
  IF quota_limit < 1 OR quota_limit > 2000 THEN RAISE EXCEPTION 'invalid quota limit'; END IF;
  IF quota_window_seconds < 60 OR quota_window_seconds > 604800 THEN RAISE EXCEPTION 'invalid quota window'; END IF;

  INSERT INTO public.ai_api_rate_limits (user_id, bucket, window_started_at, request_count)
  VALUES (auth.uid(), quota_bucket, now_utc, 1)
  ON CONFLICT (user_id, bucket) DO UPDATE
  SET window_started_at = CASE
        WHEN ai_api_rate_limits.window_started_at + make_interval(secs => quota_window_seconds) <= now_utc
          THEN now_utc
        ELSE ai_api_rate_limits.window_started_at
      END,
      request_count = CASE
        WHEN ai_api_rate_limits.window_started_at + make_interval(secs => quota_window_seconds) <= now_utc
          THEN 1
        ELSE ai_api_rate_limits.request_count + 1
      END
  RETURNING request_count INTO next_count;

  RETURN next_count <= quota_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_api_quota(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_ai_api_quota(TEXT, INTEGER, INTEGER) TO authenticated;

-- Old rate-limit rows are operational metadata and can be deleted safely.
CREATE OR REPLACE FUNCTION public.cleanup_ai_api_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE deleted_count INTEGER;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  DELETE FROM public.ai_api_rate_limits
  WHERE window_started_at < timezone('utc', now()) - interval '8 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_ai_api_rate_limits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_ai_api_rate_limits() TO authenticated;

-- Only the room host may persist the single canonical AI judgment.
CREATE OR REPLACE FUNCTION public.save_live_debate_evaluation(target_room_id TEXT, p_evaluation JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  participant_item JSONB;
  participant_user_id UUID;
  selected_room public.live_debate_rooms%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF jsonb_typeof(p_evaluation) <> 'object'
    OR jsonb_typeof(COALESCE(p_evaluation->'participantReports', 'null'::jsonb)) <> 'array'
  THEN RAISE EXCEPTION 'invalid evaluation'; END IF;

  SELECT * INTO selected_room
  FROM public.live_debate_rooms
  WHERE room_id = target_room_id
  FOR UPDATE;
  IF selected_room.id IS NULL OR selected_room.status <> 'in_progress' THEN RETURN FALSE; END IF;
  IF selected_room.host_id <> auth.uid() THEN RAISE EXCEPTION 'only the host can save the evaluation'; END IF;
  IF selected_room.evaluation IS NOT NULL THEN RETURN FALSE; END IF;

  FOR participant_item IN SELECT value FROM jsonb_array_elements(p_evaluation->'participantReports') LOOP
    BEGIN
      participant_user_id := (participant_item->>'userId')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      CONTINUE;
    END;
    IF EXISTS (
      SELECT 1 FROM public.live_debate_room_participants
      WHERE room_id = target_room_id AND user_id = participant_user_id AND NOT is_ai
    ) THEN
      INSERT INTO public.live_debate_participant_evaluations (room_id, user_id, evaluation)
      VALUES (target_room_id, participant_user_id, participant_item)
      ON CONFLICT (room_id, user_id) DO UPDATE SET evaluation = EXCLUDED.evaluation;
    END IF;
  END LOOP;

  UPDATE public.live_debate_rooms
  SET evaluation = p_evaluation - 'participantReports', status = 'closed', updated_at = timezone('utc', now())
  WHERE room_id = target_room_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.save_live_debate_evaluation(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_live_debate_evaluation(TEXT, JSONB) TO authenticated;

-- Lobby presence and mutation hardening. Clients may no longer update role/team
-- columns directly; readiness and heartbeat go through narrow RPCs.
ALTER TABLE public.live_debate_room_participants
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now());

DROP POLICY IF EXISTS "Users can update own lobby state" ON public.live_debate_room_participants;

CREATE OR REPLACE FUNCTION public.heartbeat_live_debate_lobby(target_room_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE selected_room public.live_debate_rooms%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  SELECT * INTO selected_room FROM public.live_debate_rooms WHERE room_id = target_room_id FOR UPDATE;
  IF selected_room.id IS NULL OR selected_room.status <> 'open' THEN RETURN FALSE; END IF;
  UPDATE public.live_debate_room_participants
  SET last_seen_at = timezone('utc', now()), updated_at = timezone('utc', now())
  WHERE room_id = target_room_id AND user_id = auth.uid() AND NOT is_ai;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  DELETE FROM public.live_debate_room_participants
  WHERE room_id = target_room_id AND user_id <> auth.uid()
    AND last_seen_at < timezone('utc', now()) - interval '90 seconds';
  IF NOT EXISTS (
    SELECT 1 FROM public.live_debate_room_participants
    WHERE room_id = target_room_id AND user_id = selected_room.host_id
  ) THEN
    UPDATE public.live_debate_rooms SET status = 'closed', updated_at = timezone('utc', now())
    WHERE room_id = target_room_id;
    RETURN FALSE;
  END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_live_debate_ready(target_room_id TEXT, ready BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.live_debate_rooms WHERE room_id = target_room_id AND status = 'open') THEN RETURN FALSE; END IF;
  UPDATE public.live_debate_room_participants
  SET is_ready = ready, last_seen_at = timezone('utc', now()), updated_at = timezone('utc', now())
  WHERE room_id = target_room_id AND user_id = auth.uid() AND NOT is_ai;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.heartbeat_live_debate_lobby(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_live_debate_ready(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_live_debate_lobby(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_live_debate_ready(TEXT, BOOLEAN) TO authenticated;

-- User-created topics are review candidates, not immediately public content.
ALTER TABLE public.public_debate_topics ALTER COLUMN is_active SET DEFAULT FALSE;
DROP POLICY IF EXISTS "Authenticated users can create public debate topics" ON public.public_debate_topics;
DROP POLICY IF EXISTS "Creators can update public debate topics" ON public.public_debate_topics;
DROP POLICY IF EXISTS "Creators can delete public debate topics" ON public.public_debate_topics;
DROP POLICY IF EXISTS "Creators can read own submitted debate topics" ON public.public_debate_topics;
CREATE POLICY "Creators can read own submitted debate topics"
ON public.public_debate_topics FOR SELECT TO authenticated
USING (created_by = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.public_debate_topics FROM authenticated;

CREATE OR REPLACE FUNCTION public.submit_public_debate_topic(
  topic_title TEXT,
  topic_description TEXT,
  topic_briefing JSONB,
  topic_config JSONB,
  topic_language TEXT DEFAULT 'ko'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE created_topic public.public_debate_topics%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF char_length(trim(topic_title)) NOT BETWEEN 1 AND 120
    OR char_length(trim(topic_description)) NOT BETWEEN 1 AND 2000
    OR topic_language NOT IN ('ko', 'en')
    OR jsonb_typeof(topic_briefing) <> 'object'
    OR jsonb_typeof(topic_config) <> 'object'
    OR NOT (topic_briefing ? 'context' AND topic_briefing ? 'affirmative' AND topic_briefing ? 'negative' AND topic_briefing ? 'newsLinks')
  THEN RAISE EXCEPTION 'invalid topic submission'; END IF;
  IF (SELECT count(*) FROM public.public_debate_topics WHERE created_by = auth.uid() AND created_at >= timezone('utc', now()) - interval '1 day') >= 10
  THEN RAISE EXCEPTION 'daily topic submission limit reached'; END IF;
  SELECT * INTO created_topic FROM public.public_debate_topics
  WHERE created_by = auth.uid() AND lower(trim(title)) = lower(trim(topic_title)) AND language = topic_language
  ORDER BY created_at DESC LIMIT 1;
  IF created_topic.id IS NOT NULL THEN RETURN to_jsonb(created_topic); END IF;
  INSERT INTO public.public_debate_topics
    (created_by, title, description, briefing, config, language, is_active)
  VALUES
    (auth.uid(), trim(topic_title), trim(topic_description), topic_briefing, topic_config, topic_language, FALSE)
  RETURNING * INTO created_topic;
  RETURN to_jsonb(created_topic);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_debate_topic(TEXT, TEXT, JSONB, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_debate_topic(TEXT, TEXT, JSONB, JSONB, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_public_debate_topic_active(topic_id UUID, active BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.public_debate_topics SET is_active = active WHERE id = topic_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.set_public_debate_topic_active(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_public_debate_topic_active(UUID, BOOLEAN) TO authenticated;
