-- AI seats and authoritative lobby-ready start for existing live debate rooms.
-- Run once in the Supabase SQL Editor.

ALTER TABLE public.live_debate_room_participants
  ADD COLUMN IF NOT EXISTS is_ai BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.start_live_debate_room(target_room_id TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_room public.live_debate_rooms%ROWTYPE;
  required_roles TEXT[];
  required_role TEXT;
  started_time TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  SELECT * INTO selected_room FROM public.live_debate_rooms WHERE room_id = target_room_id AND status = 'open' FOR UPDATE;
  IF selected_room.id IS NULL OR selected_room.host_id <> auth.uid() THEN RAISE EXCEPTION 'only the host can start'; END IF;

  IF selected_room.team_size = 1 THEN required_roles := ARRAY['debater'];
  ELSIF selected_room.team_size = 2 THEN required_roles := ARRAY['opening', 'rebuttal'];
  ELSE required_roles := ARRAY['opening', 'rebuttal', 'closing']; END IF;

  FOREACH required_role IN ARRAY required_roles LOOP
    IF NOT EXISTS (SELECT 1 FROM public.live_debate_room_participants WHERE room_id = target_room_id AND position = 'affirmative' AND role = required_role AND is_ready) THEN RETURN NULL; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.live_debate_room_participants WHERE room_id = target_room_id AND position = 'negative' AND role = required_role AND is_ready) THEN RETURN NULL; END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.live_debate_room_participants
    WHERE room_id = target_room_id AND role = 'moderator' AND NOT is_ready
  ) THEN RETURN NULL; END IF;

  started_time := timezone('utc', now());
  UPDATE public.live_debate_rooms
  SET status = 'in_progress', started_at = started_time, updated_at = started_time
  WHERE room_id = target_room_id;
  RETURN started_time;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_live_debate_ai_participant(
  target_room_id TEXT,
  selected_position TEXT,
  selected_role TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_room public.live_debate_rooms%ROWTYPE;
  allowed_roles TEXT[];
  ai_id UUID;
  team_count INTEGER;
  ai_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  SELECT * INTO selected_room FROM public.live_debate_rooms WHERE room_id = target_room_id AND status = 'open' FOR UPDATE;
  IF selected_room.id IS NULL OR selected_room.host_id <> auth.uid() THEN RAISE EXCEPTION 'only the host can add ai'; END IF;
  IF selected_position NOT IN ('affirmative', 'negative') THEN RAISE EXCEPTION 'invalid team'; END IF;

  IF selected_room.team_size = 1 THEN allowed_roles := ARRAY['debater'];
  ELSIF selected_room.team_size = 2 THEN allowed_roles := ARRAY['opening', 'rebuttal'];
  ELSE allowed_roles := ARRAY['opening', 'rebuttal', 'closing']; END IF;
  IF NOT (selected_role = ANY(allowed_roles)) THEN RAISE EXCEPTION 'invalid debate seat'; END IF;

  SELECT count(*) INTO team_count
  FROM public.live_debate_room_participants
  WHERE room_id = target_room_id AND position = selected_position AND role IS DISTINCT FROM 'moderator';
  IF team_count >= selected_room.team_size THEN RETURN NULL; END IF;
  IF EXISTS (
    SELECT 1 FROM public.live_debate_room_participants
    WHERE room_id = target_room_id AND position = selected_position AND role = selected_role
  ) THEN RETURN NULL; END IF;

  ai_id := gen_random_uuid();
  ai_name := 'AI · ' || CASE selected_position WHEN 'affirmative' THEN '찬성' ELSE '반대' END || ' ' ||
    CASE selected_role WHEN 'debater' THEN '토론자' WHEN 'opening' THEN '입론' WHEN 'rebuttal' THEN '질의·반론' ELSE '최종변론' END;
  INSERT INTO public.live_debate_room_participants
    (room_id, user_id, nickname, position, role, is_ai, is_ready)
  VALUES
    (target_room_id, ai_id, ai_name, selected_position, selected_role, TRUE, TRUE);
  RETURN ai_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_live_debate_ai_participant(target_room_id TEXT, ai_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.live_debate_rooms
    WHERE room_id = target_room_id AND host_id = auth.uid() AND status = 'open'
  ) THEN RAISE EXCEPTION 'only the host can remove ai'; END IF;
  DELETE FROM public.live_debate_room_participants
  WHERE room_id = target_room_id AND user_id = ai_user_id AND is_ai;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_live_debate_ai_argument(
  target_room_id TEXT,
  ai_user_id UUID,
  argument_id UUID,
  argument_content TEXT,
  argument_phase_id TEXT DEFAULT NULL,
  argument_phase_label TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ai_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.live_debate_rooms
    WHERE room_id = target_room_id AND host_id = auth.uid() AND status = 'in_progress'
  ) THEN RAISE EXCEPTION 'only the host can publish ai arguments'; END IF;
  SELECT nickname INTO ai_name
  FROM public.live_debate_room_participants
  WHERE room_id = target_room_id AND user_id = ai_user_id AND is_ai;
  IF ai_name IS NULL THEN RETURN FALSE; END IF;
  IF argument_phase_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.live_debate_arguments
    WHERE room_id = target_room_id AND user_id = ai_user_id AND phase_id = argument_phase_id
  ) THEN RETURN FALSE; END IF;

  INSERT INTO public.live_debate_arguments
    (id, room_id, user_id, sender_name, content, source, phase_id, phase_label)
  VALUES
    (argument_id, target_room_id, ai_user_id, ai_name, left(trim(argument_content), 1200), 'text', argument_phase_id, argument_phase_label)
  ON CONFLICT (id) DO NOTHING;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_live_debate_room(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_live_debate_ai_participant(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_live_debate_ai_participant(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_live_debate_ai_argument(TEXT, UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
