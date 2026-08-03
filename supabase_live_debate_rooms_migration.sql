-- ThinkFit B2C/B2B 실시간 자유 토론방 목록.
-- Supabase SQL Editor에서 기존 B2B migration 다음에 한 번 실행하세요.

CREATE TABLE IF NOT EXISTS public.live_debate_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL UNIQUE CHECK (room_id ~ '^debate-[a-zA-Z0-9_-]{8,80}$'),
  host_id UUID NOT NULL,
  host_name TEXT NOT NULL DEFAULT '토론 개설자',
  topic TEXT NOT NULL CHECK (char_length(topic) BETWEEN 1 AND 120),
  topic_description TEXT NOT NULL DEFAULT '',
  debate_level TEXT NOT NULL DEFAULT 'beginner' CHECK (debate_level IN ('beginner', 'intermediate')),
  voice_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  time_limit INTEGER NOT NULL CHECK (time_limit IN (600, 900, 1200)),
  team_size INTEGER NOT NULL CHECK (team_size BETWEEN 1 AND 3),
  allow_moderator BOOLEAN NOT NULL DEFAULT TRUE,
  audience TEXT NOT NULL CHECK (audience IN ('public', 'organization')),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  organization_name TEXT,
  host_position TEXT NOT NULL CHECK (host_position IN ('affirmative', 'negative')),
  host_role TEXT NOT NULL CHECK (host_role IN ('debater', 'opening', 'rebuttal', 'closing')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  participant_count INTEGER NOT NULL DEFAULT 1 CHECK (participant_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  started_at TIMESTAMPTZ,
  evaluation JSONB,
  CHECK (
    (audience = 'public' AND organization_id IS NULL)
    OR (audience = 'organization' AND organization_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_live_debate_rooms_lobby
  ON public.live_debate_rooms (audience, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_debate_rooms_organization
  ON public.live_debate_rooms (organization_id, status, created_at DESC);

ALTER TABLE public.live_debate_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read available live debate rooms" ON public.live_debate_rooms;
DROP POLICY IF EXISTS "Authenticated users can create live debate rooms" ON public.live_debate_rooms;
DROP POLICY IF EXISTS "Hosts can update live debate rooms" ON public.live_debate_rooms;

CREATE POLICY "Members can read available live debate rooms"
ON public.live_debate_rooms FOR SELECT TO authenticated
USING (
  audience = 'public'
  OR EXISTS (
    SELECT 1 FROM public.organization_memberships membership
    WHERE membership.organization_id = live_debate_rooms.organization_id
      AND membership.user_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can create live debate rooms"
ON public.live_debate_rooms FOR INSERT TO authenticated
WITH CHECK (
  host_id = auth.uid()
  AND (
    audience = 'public'
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships membership
      WHERE membership.organization_id = live_debate_rooms.organization_id
        AND membership.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Hosts can update live debate rooms"
ON public.live_debate_rooms FOR UPDATE TO authenticated
USING (host_id = auth.uid())
WITH CHECK (host_id = auth.uid());

CREATE OR REPLACE FUNCTION public.join_live_debate_room(target_room_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_room public.live_debate_rooms%ROWTYPE;
  room_capacity INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;

  SELECT * INTO selected_room
  FROM public.live_debate_rooms
  WHERE room_id = target_room_id AND status = 'open'
  FOR UPDATE;

  IF selected_room.id IS NULL THEN RETURN FALSE; END IF;
  IF selected_room.audience = 'organization' AND NOT EXISTS (
    SELECT 1 FROM public.organization_memberships membership
    WHERE membership.organization_id = selected_room.organization_id
      AND membership.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not an organization member';
  END IF;

  room_capacity := selected_room.team_size * 2 + CASE WHEN selected_room.allow_moderator THEN 1 ELSE 0 END;
  IF selected_room.participant_count >= room_capacity THEN RETURN FALSE; END IF;

  UPDATE public.live_debate_rooms
  SET participant_count = participant_count + 1,
      updated_at = timezone('utc', now())
  WHERE id = selected_room.id;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_live_debate_room(TEXT) TO authenticated;

-- ── Separate multi-user lobby ────────────────────────────────────────────

ALTER TABLE public.live_debate_rooms ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.live_debate_rooms ADD COLUMN IF NOT EXISTS evaluation JSONB;
ALTER TABLE public.live_debate_rooms ADD COLUMN IF NOT EXISTS topic_description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.live_debate_rooms ADD COLUMN IF NOT EXISTS debate_level TEXT NOT NULL DEFAULT 'beginner';
ALTER TABLE public.live_debate_rooms ADD COLUMN IF NOT EXISTS voice_enabled BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  ALTER TABLE public.live_debate_rooms
    ADD CONSTRAINT live_debate_rooms_debate_level_check
    CHECK (debate_level IN ('beginner', 'intermediate'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.live_debate_room_participants (
  room_id TEXT NOT NULL REFERENCES public.live_debate_rooms(room_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  nickname TEXT NOT NULL DEFAULT '참가자',
  position TEXT CHECK (position IN ('affirmative', 'negative')),
  role TEXT CHECK (role IN ('debater', 'opening', 'rebuttal', 'closing', 'moderator')),
  is_ai BOOLEAN NOT NULL DEFAULT FALSE,
  is_ready BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (room_id, user_id),
  CHECK ((role = 'moderator' AND position IS NULL) OR role <> 'moderator' OR role IS NULL)
);

ALTER TABLE public.live_debate_room_participants
  ADD COLUMN IF NOT EXISTS is_ai BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.live_debate_participant_evaluations (
  room_id TEXT NOT NULL REFERENCES public.live_debate_rooms(room_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  evaluation JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.live_debate_arguments (
  id UUID PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES public.live_debate_rooms(room_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  sender_name TEXT NOT NULL DEFAULT '토론 참가자',
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1200),
  source TEXT NOT NULL DEFAULT 'text' CHECK (source IN ('text', 'voice')),
  phase_id TEXT,
  phase_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_live_debate_arguments_room_time
  ON public.live_debate_arguments(room_id, created_at);

GRANT SELECT, INSERT ON public.live_debate_arguments TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_debate_unique_team_seat
  ON public.live_debate_room_participants(room_id, position, role)
  WHERE role IS NOT NULL AND role <> 'moderator';
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_debate_unique_moderator
  ON public.live_debate_room_participants(room_id, role)
  WHERE role = 'moderator';

ALTER TABLE public.live_debate_room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_debate_participant_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_debate_arguments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Room participants can read live debate arguments" ON public.live_debate_arguments;
DROP POLICY IF EXISTS "Room participants can create live debate arguments" ON public.live_debate_arguments;

CREATE POLICY "Room participants can read live debate arguments"
ON public.live_debate_arguments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.live_debate_room_participants participant
    WHERE participant.room_id = live_debate_arguments.room_id
      AND participant.user_id = auth.uid()
  )
);

CREATE POLICY "Room participants can create live debate arguments"
ON public.live_debate_arguments FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.live_debate_room_participants participant
    JOIN public.live_debate_rooms room ON room.room_id = participant.room_id
    WHERE participant.room_id = live_debate_arguments.room_id
      AND participant.user_id = auth.uid()
      AND room.status = 'in_progress'
  )
);

DROP POLICY IF EXISTS "Users can read own live debate evaluation" ON public.live_debate_participant_evaluations;
CREATE POLICY "Users can read own live debate evaluation"
ON public.live_debate_participant_evaluations FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Room members can read lobby participants" ON public.live_debate_room_participants;
DROP POLICY IF EXISTS "Users can update own lobby state" ON public.live_debate_room_participants;
DROP POLICY IF EXISTS "Users can leave live debate lobby" ON public.live_debate_room_participants;

CREATE POLICY "Room members can read lobby participants"
ON public.live_debate_room_participants FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.live_debate_rooms room
    WHERE room.room_id = live_debate_room_participants.room_id
      AND (
        room.audience = 'public'
        OR EXISTS (
          SELECT 1 FROM public.organization_memberships membership
          WHERE membership.organization_id = room.organization_id
            AND membership.user_id = auth.uid()
        )
      )
  )
);

CREATE POLICY "Users can update own lobby state"
ON public.live_debate_room_participants FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave live debate lobby"
ON public.live_debate_room_participants FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.enter_live_debate_lobby(
  target_room_id TEXT,
  participant_nickname TEXT,
  initial_position TEXT DEFAULT NULL,
  initial_role TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_room public.live_debate_rooms%ROWTYPE;
  lobby_capacity INTEGER;
  current_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  SELECT * INTO selected_room FROM public.live_debate_rooms WHERE room_id = target_room_id FOR UPDATE;
  IF selected_room.id IS NULL OR selected_room.status <> 'open' THEN RAISE EXCEPTION 'room is not open'; END IF;
  IF selected_room.audience = 'organization' AND NOT EXISTS (
    SELECT 1 FROM public.organization_memberships membership
    WHERE membership.organization_id = selected_room.organization_id AND membership.user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'not an organization member'; END IF;

  IF EXISTS (SELECT 1 FROM public.live_debate_room_participants WHERE room_id = target_room_id AND user_id = auth.uid()) THEN
    UPDATE public.live_debate_room_participants
    SET nickname = left(COALESCE(NULLIF(trim(participant_nickname), ''), nickname), 60), updated_at = timezone('utc', now())
    WHERE room_id = target_room_id AND user_id = auth.uid();
    RETURN TRUE;
  END IF;

  lobby_capacity := selected_room.team_size * 2 + CASE WHEN selected_room.allow_moderator THEN 1 ELSE 0 END;
  SELECT count(*) INTO current_count FROM public.live_debate_room_participants WHERE room_id = target_room_id;
  IF current_count >= lobby_capacity THEN RAISE EXCEPTION 'lobby is full'; END IF;

  INSERT INTO public.live_debate_room_participants (room_id, user_id, nickname)
  VALUES (target_room_id, auth.uid(), left(COALESCE(NULLIF(trim(participant_nickname), ''), '참가자'), 60));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_live_debate_seat(
  target_room_id TEXT,
  selected_position TEXT,
  selected_role TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_room public.live_debate_rooms%ROWTYPE;
  allowed_roles TEXT[];
  participant_position TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  SELECT * INTO selected_room FROM public.live_debate_rooms WHERE room_id = target_room_id AND status = 'open' FOR UPDATE;
  IF selected_room.id IS NULL THEN RAISE EXCEPTION 'room is not open'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.live_debate_room_participants WHERE room_id = target_room_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'enter lobby first';
  END IF;

  SELECT position INTO participant_position
  FROM public.live_debate_room_participants
  WHERE room_id = target_room_id AND user_id = auth.uid();

  IF selected_room.team_size = 1 THEN allowed_roles := ARRAY['debater'];
  ELSIF selected_room.team_size = 2 THEN allowed_roles := ARRAY['opening', 'rebuttal'];
  ELSE allowed_roles := ARRAY['opening', 'rebuttal', 'closing']; END IF;

  IF selected_role = 'moderator' THEN
    IF NOT selected_room.allow_moderator OR selected_position IS NOT NULL THEN RAISE EXCEPTION 'moderator is not allowed'; END IF;
    IF EXISTS (SELECT 1 FROM public.live_debate_room_participants WHERE room_id = target_room_id AND role = 'moderator' AND user_id <> auth.uid()) THEN RETURN FALSE; END IF;
  ELSE
    IF selected_position NOT IN ('affirmative', 'negative') OR NOT (selected_role = ANY(allowed_roles)) THEN RAISE EXCEPTION 'invalid debate seat'; END IF;
    IF participant_position IS NULL OR participant_position <> selected_position THEN RAISE EXCEPTION 'choose team first'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.live_debate_room_participants
      WHERE room_id = target_room_id AND position = selected_position AND role = selected_role AND user_id <> auth.uid()
    ) THEN RETURN FALSE; END IF;
  END IF;

  UPDATE public.live_debate_room_participants
  SET position = selected_position, role = selected_role, is_ready = FALSE, updated_at = timezone('utc', now())
  WHERE room_id = target_room_id AND user_id = auth.uid();
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.choose_live_debate_team(
  target_room_id TEXT,
  selected_position TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_room public.live_debate_rooms%ROWTYPE;
  team_count INTEGER;
  current_position TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF selected_position NOT IN ('affirmative', 'negative') THEN RAISE EXCEPTION 'invalid team'; END IF;
  SELECT * INTO selected_room FROM public.live_debate_rooms WHERE room_id = target_room_id AND status = 'open' FOR UPDATE;
  IF selected_room.id IS NULL THEN RAISE EXCEPTION 'room is not open'; END IF;

  SELECT position INTO current_position
  FROM public.live_debate_room_participants
  WHERE room_id = target_room_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'enter lobby first'; END IF;
  IF current_position = selected_position THEN RETURN TRUE; END IF;

  SELECT count(*) INTO team_count
  FROM public.live_debate_room_participants
  WHERE room_id = target_room_id AND position = selected_position AND role IS DISTINCT FROM 'moderator';
  IF team_count >= selected_room.team_size THEN RETURN FALSE; END IF;

  UPDATE public.live_debate_room_participants
  SET position = selected_position, role = NULL, is_ready = FALSE, updated_at = timezone('utc', now())
  WHERE room_id = target_room_id AND user_id = auth.uid();
  RETURN TRUE;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.save_live_debate_evaluation(target_room_id TEXT, p_evaluation JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  participant_item JSONB;
  participant_user_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF jsonb_typeof(p_evaluation) <> 'object' THEN RAISE EXCEPTION 'invalid evaluation'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.live_debate_room_participants
    WHERE room_id = target_room_id AND user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'not a room participant'; END IF;

  FOR participant_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_evaluation->'participantReports', '[]'::jsonb)) LOOP
    BEGIN
      participant_user_id := (participant_item->>'userId')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      CONTINUE;
    END;
    IF EXISTS (
      SELECT 1 FROM public.live_debate_room_participants
      WHERE room_id = target_room_id AND user_id = participant_user_id
    ) THEN
      INSERT INTO public.live_debate_participant_evaluations (room_id, user_id, evaluation)
      VALUES (target_room_id, participant_user_id, participant_item)
      ON CONFLICT (room_id, user_id) DO UPDATE SET evaluation = EXCLUDED.evaluation;
    END IF;
  END LOOP;

  UPDATE public.live_debate_rooms
  SET evaluation = p_evaluation - 'participantReports', status = 'closed', updated_at = timezone('utc', now())
  WHERE room_id = target_room_id AND status = 'in_progress' AND evaluation IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_live_debate_evaluation(target_room_id TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT CASE
    WHEN room.evaluation IS NULL THEN NULL
    ELSE room.evaluation || jsonb_build_object(
      'participantReports', COALESCE(
        (SELECT jsonb_agg(private_eval.evaluation)
         FROM public.live_debate_participant_evaluations private_eval
         WHERE private_eval.room_id = room.room_id AND private_eval.user_id = auth.uid()),
        '[]'::jsonb
      )
    )
  END
  FROM public.live_debate_rooms room
  WHERE room.room_id = target_room_id
    AND EXISTS (
      SELECT 1 FROM public.live_debate_room_participants participant
      WHERE participant.room_id = room.room_id AND participant.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.sync_live_debate_participant_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.live_debate_rooms
  SET participant_count = (SELECT count(*) FROM public.live_debate_room_participants WHERE room_id = COALESCE(NEW.room_id, OLD.room_id)),
      updated_at = timezone('utc', now())
  WHERE room_id = COALESCE(NEW.room_id, OLD.room_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_live_debate_participant_count ON public.live_debate_room_participants;
CREATE TRIGGER trg_sync_live_debate_participant_count
AFTER INSERT OR DELETE ON public.live_debate_room_participants
FOR EACH ROW EXECUTE FUNCTION public.sync_live_debate_participant_count();

GRANT EXECUTE ON FUNCTION public.enter_live_debate_lobby(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.choose_live_debate_team(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_live_debate_seat(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_live_debate_room(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_live_debate_ai_participant(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_live_debate_ai_participant(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_live_debate_ai_argument(TEXT, UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_live_debate_evaluation(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_live_debate_evaluation(TEXT) TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_debate_rooms;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_debate_room_participants;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_debate_arguments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Make newly created RPC signatures visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
