-- Four-stage human debates. Existing rooms with NULL session_config keep v1 rules.
BEGIN;
ALTER TABLE public.live_debate_rooms ADD COLUMN IF NOT EXISTS session_config jsonb;
ALTER TABLE public.live_debate_rooms ADD COLUMN IF NOT EXISTS session_plan jsonb;
ALTER TABLE public.live_debate_rooms DROP CONSTRAINT IF EXISTS live_debate_rooms_time_limit_check;
ALTER TABLE public.live_debate_rooms ADD CONSTRAINT live_debate_rooms_time_limit_check CHECK (time_limit BETWEEN 30 AND 7320);

CREATE OR REPLACE FUNCTION public.build_live_session_plan(config jsonb, team_size integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE stage jsonb; plan jsonb := '[]'; stage_id text; label text; position text; seconds integer; idx integer := 0;
  ids text[] := ARRAY['opening','cross-question','rebuttal','closing'];
BEGIN
  IF config->>'version' IS DISTINCT FROM '2' OR config->>'progressionMode' NOT IN ('automatic','moderated')
    OR config->>'assignmentMode' NOT IN ('free','assigned') OR config->>'progressionMode' IS NULL OR config->>'assignmentMode' IS NULL
    OR jsonb_typeof(config->'stages') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid session settings'; END IF;
  IF jsonb_array_length(config->'stages') <> 4 OR config->>'strategySeconds' IS NULL
    OR config->>'strategySeconds' NOT IN ('0','60') OR (team_size = 1 AND config->>'strategySeconds' <> '0') THEN RAISE EXCEPTION 'invalid session settings'; END IF;
  FOR stage IN SELECT value FROM jsonb_array_elements(config->'stages') LOOP
    idx := idx + 1; stage_id := stage->>'id';
    IF stage_id IS DISTINCT FROM ids[idx] OR jsonb_typeof(stage->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'invalid session stage'; END IF;
    FOREACH position IN ARRAY ARRAY['affirmative','negative'] LOOP
      IF jsonb_typeof(stage->(position || 'Seconds')) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'invalid session duration'; END IF;
      IF (stage->>(position || 'Seconds'))::numeric <> trunc((stage->>(position || 'Seconds'))::numeric) THEN RAISE EXCEPTION 'invalid session duration'; END IF;
      seconds := (stage->>(position || 'Seconds'))::integer;
      IF seconds < 30 OR seconds > 900 OR seconds % 15 <> 0 THEN RAISE EXCEPTION 'invalid session duration'; END IF;
    END LOOP;
    IF NOT (stage->>'enabled')::boolean THEN CONTINUE; END IF;
    label := CASE stage_id WHEN 'opening' THEN '입론' WHEN 'cross-question' THEN '교차질문' WHEN 'rebuttal' THEN '반박' ELSE '최종발언' END;
    IF config->>'strategySeconds' = '60' AND stage_id IN ('cross-question','rebuttal') THEN
      plan := plan || jsonb_build_array(jsonb_build_object('id','strategy-before-' || stage_id,'stageId',stage_id,'kind','strategy','position',NULL,'label',label || ' 전 작전시간','seconds',60));
    END IF;
    FOREACH position IN ARRAY ARRAY['affirmative','negative'] LOOP
      plan := plan || jsonb_build_array(jsonb_build_object('id',position || '-' || stage_id,'stageId',stage_id,
        'kind',CASE WHEN stage_id = 'cross-question' THEN 'cross_examination' ELSE 'speech' END,'position',position,
        'label',CASE WHEN position = 'affirmative' THEN '찬성 ' ELSE '반대 ' END || label,'seconds',(stage->>(position || 'Seconds'))::integer));
    END LOOP;
  END LOOP;
  IF jsonb_array_length(plan) = 0 THEN RAISE EXCEPTION 'at least one stage is required'; END IF;
  RETURN plan;
END $$;

CREATE OR REPLACE FUNCTION public.validate_live_session_room() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND NEW.session_config IS NOT NULL THEN
    IF TG_OP = 'INSERT' AND (NEW.status <> 'open' OR NEW.evaluation IS NOT NULL OR NEW.started_at IS NOT NULL) THEN RAISE EXCEPTION 'new sessions must start in the lobby'; END IF;
    IF TG_OP = 'UPDATE' AND (NEW.session_config IS DISTINCT FROM OLD.session_config OR NEW.team_size <> OLD.team_size
      OR NEW.session_plan IS DISTINCT FROM OLD.session_plan OR NEW.evaluation IS DISTINCT FROM OLD.evaluation
      OR NEW.started_at IS DISTINCT FROM OLD.started_at OR (NEW.status <> OLD.status AND NOT (OLD.status='open' AND NEW.status='closed')))
      THEN RAISE EXCEPTION 'use session settings or control RPC'; END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.session_config IS NOT NULL AND NEW.session_config IS NULL THEN RAISE EXCEPTION 'session version cannot be changed'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.session_config IS NOT NULL AND OLD.status <> 'open'
    AND (NEW.session_config IS DISTINCT FROM OLD.session_config OR NEW.team_size <> OLD.team_size OR NEW.session_plan IS DISTINCT FROM OLD.session_plan) THEN
    RAISE EXCEPTION 'session settings are locked after start';
  END IF;
  IF NEW.session_config IS NOT NULL THEN
    NEW.session_plan := public.build_live_session_plan(NEW.session_config, NEW.team_size);
    SELECT sum((value->>'seconds')::integer) INTO NEW.time_limit FROM jsonb_array_elements(NEW.session_plan);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_live_session_room ON public.live_debate_rooms;
CREATE TRIGGER validate_live_session_room BEFORE INSERT OR UPDATE ON public.live_debate_rooms FOR EACH ROW EXECUTE FUNCTION public.validate_live_session_room();

CREATE TABLE IF NOT EXISTS public.live_debate_sessions (
  room_id text PRIMARY KEY REFERENCES public.live_debate_rooms(room_id) ON DELETE CASCADE,
  phase_index integer NOT NULL DEFAULT 0,
  phase_started_at timestamptz NOT NULL,
  deadline_at timestamptz NOT NULL,
  paused_at timestamptz,
  remaining_seconds numeric,
  paused_total_seconds numeric NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 0,
  finished_at timestamptz,
  history jsonb NOT NULL DEFAULT '[]',
  control_log jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS public.live_debate_speech_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text NOT NULL REFERENCES public.live_debate_rooms(room_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  phase_id text NOT NULL,
  phase_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  consumed boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS live_speech_ticket_room ON public.live_debate_speech_tickets(room_id, expires_at);
CREATE TABLE IF NOT EXISTS public.live_debate_team_messages (
  id uuid PRIMARY KEY,
  room_id text NOT NULL REFERENCES public.live_debate_rooms(room_id) ON DELETE CASCADE,
  team_key text NOT NULL,
  user_id uuid NOT NULL,
  nickname text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_team_message_room ON public.live_debate_team_messages(room_id, created_at);
ALTER TABLE public.live_debate_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_debate_speech_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_debate_team_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.live_debate_sessions, public.live_debate_team_messages TO authenticated;
REVOKE ALL ON public.live_debate_speech_tickets FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.live_team_key(target_room_id text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT me.position || ':' || string_agg(m.user_id::text, ',' ORDER BY m.user_id)
  FROM public.live_debate_room_participants me
  JOIN public.live_debate_room_participants m ON m.room_id = me.room_id AND m.position = me.position AND NOT m.is_ai AND m.role = 'debater'
  JOIN public.live_debate_rooms r ON r.room_id = me.room_id
  WHERE me.room_id = target_room_id AND me.user_id = auth.uid() AND me.role = 'debater' AND NOT me.is_ai AND r.team_size > 1 AND r.session_config IS NOT NULL
  GROUP BY me.position;
$$;
CREATE POLICY "Participants read session state" ON public.live_debate_sessions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.live_debate_room_participants p WHERE p.room_id = live_debate_sessions.room_id AND p.user_id = auth.uid() AND NOT p.is_ai)
);
CREATE POLICY "Current team reads its messages" ON public.live_debate_team_messages FOR SELECT TO authenticated
  USING (team_key = public.live_team_key(room_id));

CREATE OR REPLACE FUNCTION public.guard_live_session_roster() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.live_debate_rooms;
BEGIN
  SELECT * INTO r FROM public.live_debate_rooms WHERE room_id=coalesce(NEW.room_id,OLD.room_id) FOR UPDATE;
  IF r.session_config IS NULL THEN RETURN coalesce(NEW,OLD); END IF;
  IF r.status <> 'open' AND (TG_OP IN ('INSERT','DELETE') OR NEW.position IS DISTINCT FROM OLD.position
    OR NEW.role IS DISTINCT FROM OLD.role OR NEW.phase_ids IS DISTINCT FROM OLD.phase_ids OR NEW.user_id IS DISTINCT FROM OLD.user_id)
    THEN RAISE EXCEPTION 'roster is locked after start'; END IF;
  IF TG_OP='UPDATE' AND OLD.is_ready AND (NEW.position IS DISTINCT FROM OLD.position OR NEW.role IS DISTINCT FROM OLD.role)
    THEN RAISE EXCEPTION 'cancel ready before changing teams'; END IF;
  RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER guard_live_session_roster BEFORE INSERT OR UPDATE OR DELETE ON public.live_debate_room_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_live_session_roster();

-- Keep the old functions intact for rooms created before this migration.
DO $$ DECLARE fn text; signature text; BEGIN
  FOREACH signature IN ARRAY ARRAY['choose_live_debate_team(text,text)','set_live_debate_stage_assignment(text,text,boolean)','start_live_debate_room(text)'] LOOP
    fn := split_part(signature,'(',1);
    IF to_regprocedure(replace(signature,fn,fn || '_v1')) IS NULL THEN
      EXECUTE 'ALTER FUNCTION public.' || signature || ' RENAME TO ' || fn || '_v1';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.choose_live_debate_team_v1(text,text), public.set_live_debate_stage_assignment_v1(text,text,boolean), public.start_live_debate_room_v1(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.choose_live_debate_team(target_room_id text, selected_position text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.live_debate_rooms; result boolean;
BEGIN
  SELECT * INTO r FROM public.live_debate_rooms WHERE room_id = target_room_id FOR UPDATE;
  IF r.session_config IS NULL THEN RETURN public.choose_live_debate_team_v1(target_room_id,selected_position); END IF;
  IF EXISTS (SELECT 1 FROM public.live_debate_room_participants WHERE room_id = target_room_id AND user_id = auth.uid() AND is_ready) THEN RAISE EXCEPTION 'cancel ready before changing teams'; END IF;
  result := public.choose_live_debate_team_v1(target_room_id,selected_position);
  IF result AND r.team_size = 1 THEN
    UPDATE public.live_debate_room_participants SET phase_ids = ARRAY(SELECT value->>'id' FROM jsonb_array_elements(r.session_config->'stages') WHERE (value->>'enabled')::boolean)
    WHERE room_id = target_room_id AND user_id = auth.uid();
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.set_live_debate_stage_assignment(target_room_id text, selected_stage_id text, assigned boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.live_debate_rooms; me public.live_debate_room_participants;
BEGIN
  SELECT * INTO r FROM public.live_debate_rooms WHERE room_id = target_room_id FOR UPDATE;
  IF r.session_config IS NULL THEN RETURN public.set_live_debate_stage_assignment_v1(target_room_id,selected_stage_id,assigned); END IF;
  SELECT * INTO me FROM public.live_debate_room_participants WHERE room_id = target_room_id AND user_id = auth.uid() AND NOT is_ai;
  IF r.status <> 'open' OR me.position IS NULL OR me.role <> 'debater' OR me.is_ready OR r.team_size = 1 OR r.session_config->>'assignmentMode' <> 'assigned' THEN RAISE EXCEPTION 'role assignment is not available'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.session_config->'stages') WHERE value->>'id' = selected_stage_id AND (value->>'enabled')::boolean) THEN RAISE EXCEPTION 'invalid stage'; END IF;
  IF assigned THEN
    IF EXISTS (SELECT 1 FROM public.live_debate_room_participants WHERE room_id = target_room_id AND position = me.position AND selected_stage_id = ANY(phase_ids) AND is_ready) THEN RAISE EXCEPTION 'assigned participant is ready'; END IF;
    UPDATE public.live_debate_room_participants SET phase_ids = array_remove(phase_ids,selected_stage_id), is_ready = false WHERE room_id = target_room_id AND position = me.position;
    UPDATE public.live_debate_room_participants SET phase_ids = array_append(phase_ids,selected_stage_id) WHERE room_id = target_room_id AND user_id = me.user_id;
  ELSE
    UPDATE public.live_debate_room_participants SET phase_ids = array_remove(phase_ids,selected_stage_id), is_ready = false WHERE room_id = target_room_id AND user_id = me.user_id;
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.start_live_debate_room(target_room_id text) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.live_debate_rooms; stage jsonb; position_name text; started timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO r FROM public.live_debate_rooms WHERE room_id = target_room_id FOR UPDATE;
  IF r.session_config IS NULL THEN RETURN public.start_live_debate_room_v1(target_room_id); END IF;
  IF auth.uid() IS NULL OR r.host_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'only host can start'; END IF;
  IF r.status <> 'open' THEN RETURN r.started_at; END IF;
  IF EXISTS (SELECT 1 FROM public.live_debate_room_participants WHERE room_id = target_room_id AND (is_ai OR NOT is_ready OR (role IS DISTINCT FROM 'moderator' AND position IS NULL))) THEN RETURN NULL; END IF;
  FOREACH position_name IN ARRAY ARRAY['affirmative','negative'] LOOP
    IF (SELECT count(*) FROM public.live_debate_room_participants WHERE room_id = target_room_id AND position = position_name AND role = 'debater') <> r.team_size THEN RETURN NULL; END IF;
    IF r.team_size > 1 AND r.session_config->>'assignmentMode' = 'assigned' THEN
      FOR stage IN SELECT value FROM jsonb_array_elements(r.session_config->'stages') WHERE (value->>'enabled')::boolean LOOP
        IF NOT EXISTS (SELECT 1 FROM public.live_debate_room_participants WHERE room_id = target_room_id AND position = position_name AND stage->>'id' = ANY(phase_ids)) THEN RETURN NULL; END IF;
      END LOOP;
    END IF;
  END LOOP;
  INSERT INTO public.live_debate_sessions(room_id,phase_started_at,deadline_at) VALUES(target_room_id,started,started + make_interval(secs => (r.session_plan->0->>'seconds')::integer));
  UPDATE public.live_debate_rooms SET status = 'in_progress', started_at = started, updated_at = started WHERE room_id = target_room_id;
  RETURN started;
END $$;

CREATE OR REPLACE FUNCTION public.live_session_can_speak(target_room_id text, phase jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.live_debate_room_participants p JOIN public.live_debate_rooms r USING(room_id)
    WHERE p.room_id = target_room_id AND p.user_id = auth.uid() AND NOT p.is_ai AND p.role = 'debater' AND p.position IS NOT NULL
      AND phase->>'kind' <> 'strategy' AND (phase->>'kind' = 'cross_examination' OR phase->>'position' = p.position)
      AND (r.team_size = 1 OR r.session_config->>'assignmentMode' = 'free' OR phase->>'stageId' = ANY(p.phase_ids)));
$$;

CREATE OR REPLACE FUNCTION public.control_live_debate_session(target_room_id text, action text DEFAULT 'tick', expected_revision integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.live_debate_rooms; s public.live_debate_sessions; t timestamptz := clock_timestamp(); at_time timestamptz; phase jsonb; controller boolean; changed boolean := false;
BEGIN
  SELECT * INTO r FROM public.live_debate_rooms WHERE room_id = target_room_id FOR UPDATE;
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.live_debate_room_participants WHERE room_id = target_room_id AND user_id = auth.uid() AND NOT is_ai) THEN RAISE EXCEPTION 'not a room participant'; END IF;
  SELECT * INTO s FROM public.live_debate_sessions WHERE room_id = target_room_id FOR UPDATE;
  t := clock_timestamp();
  IF s.room_id IS NULL THEN RAISE EXCEPTION 'session not started'; END IF;
  controller := r.host_id = auth.uid() OR EXISTS (SELECT 1 FROM public.live_debate_room_participants WHERE room_id = target_room_id AND user_id = auth.uid() AND role = 'moderator');
  IF action NOT IN ('tick','next','pause','resume','extend','finish') THEN RAISE EXCEPTION 'invalid control action'; END IF;
  IF action <> 'tick' AND NOT controller THEN RAISE EXCEPTION 'only host or moderator can control'; END IF;
  IF action <> 'tick' AND expected_revision IS DISTINCT FROM s.revision THEN RAISE EXCEPTION 'session changed; refresh and retry'; END IF;
  -- Catch up from server deadlines, including after all browsers were disconnected.
  WHILE s.finished_at IS NULL AND s.paused_at IS NULL AND s.deadline_at <= t AND r.session_config->>'progressionMode' = 'automatic' LOOP
    phase := r.session_plan->s.phase_index; at_time := s.deadline_at;
    s.history := s.history || jsonb_build_array(jsonb_build_object('phaseId',phase->>'id','startedAt',s.phase_started_at,'endedAt',at_time,'elapsedSeconds',greatest(0,extract(epoch FROM at_time-s.phase_started_at)-s.paused_total_seconds)));
    s.phase_index := s.phase_index + 1; s.revision := s.revision + 1; changed := true;
    IF s.phase_index >= jsonb_array_length(r.session_plan) THEN s.finished_at := at_time; EXIT; END IF;
    s.phase_started_at := at_time; s.paused_total_seconds := 0;
    s.deadline_at := at_time + make_interval(secs => (r.session_plan->s.phase_index->>'seconds')::integer);
  END LOOP;
  -- A stale button cannot pause/skip a different phase after automatic catch-up.
  IF action <> 'tick' AND changed THEN action := 'tick'; END IF;
  IF s.finished_at IS NULL AND action <> 'tick' THEN
    s.control_log := s.control_log || jsonb_build_array(jsonb_build_object('action',action,'userId',auth.uid(),'at',t,'phaseIndex',s.phase_index));
    IF action = 'pause' AND s.paused_at IS NULL THEN s.paused_at := t; s.remaining_seconds := extract(epoch FROM s.deadline_at-t);
    ELSIF action = 'resume' AND s.paused_at IS NOT NULL THEN
      s.paused_total_seconds := s.paused_total_seconds + extract(epoch FROM t-s.paused_at);
      s.deadline_at := t + make_interval(secs => s.remaining_seconds::double precision); s.paused_at := NULL; s.remaining_seconds := NULL;
    ELSIF action = 'extend' THEN
      s.deadline_at := s.deadline_at + interval '30 seconds';
      IF s.paused_at IS NOT NULL THEN s.remaining_seconds := s.remaining_seconds + 30; END IF;
    ELSIF action IN ('next','finish') THEN
      phase := r.session_plan->s.phase_index;
      s.history := s.history || jsonb_build_array(jsonb_build_object('phaseId',phase->>'id','startedAt',s.phase_started_at,'endedAt',t,'elapsedSeconds',greatest(0,extract(epoch FROM coalesce(s.paused_at,t)-s.phase_started_at)-s.paused_total_seconds)));
      s.phase_index := CASE WHEN action = 'finish' THEN jsonb_array_length(r.session_plan) ELSE s.phase_index+1 END;
      IF s.phase_index >= jsonb_array_length(r.session_plan) THEN s.finished_at := t;
      ELSE s.phase_started_at := t; s.deadline_at := t + make_interval(secs => (r.session_plan->s.phase_index->>'seconds')::integer); END IF;
      s.paused_at := NULL; s.remaining_seconds := NULL; s.paused_total_seconds := 0;
    END IF;
    s.revision := s.revision+1; changed := true;
  END IF;
  IF changed THEN UPDATE public.live_debate_sessions SET phase_index=s.phase_index, phase_started_at=s.phase_started_at, deadline_at=s.deadline_at,
    paused_at=s.paused_at, remaining_seconds=s.remaining_seconds, paused_total_seconds=s.paused_total_seconds, revision=s.revision, finished_at=s.finished_at, history=s.history, control_log=s.control_log WHERE room_id=target_room_id; END IF;
  RETURN (to_jsonb(s)-'control_log') || jsonb_build_object('server_now',t,'pending_speeches',(SELECT count(*) FROM public.live_debate_speech_tickets WHERE room_id=target_room_id AND NOT consumed AND expires_at>t));
END $$;

CREATE OR REPLACE FUNCTION public.begin_live_debate_speech(target_room_id text, expected_phase_id text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE snapshot jsonb; r public.live_debate_rooms; phase jsonb; ticket uuid;
BEGIN
  snapshot := public.control_live_debate_session(target_room_id);
  SELECT * INTO r FROM public.live_debate_rooms WHERE room_id=target_room_id;
  phase := r.session_plan->(snapshot->>'phase_index')::integer;
  IF snapshot->>'finished_at' IS NOT NULL OR snapshot->>'paused_at' IS NOT NULL OR phase->>'id' IS DISTINCT FROM expected_phase_id OR NOT public.live_session_can_speak(target_room_id,phase) THEN RAISE EXCEPTION 'not your speaking session'; END IF;
  IF EXISTS(SELECT 1 FROM public.live_debate_speech_tickets WHERE room_id=target_room_id AND user_id=auth.uid() AND NOT consumed AND ended_at IS NULL AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'finish the previous recording first'; END IF;
  INSERT INTO public.live_debate_speech_tickets(room_id,user_id,phase_id,phase_label,expires_at)
    VALUES(target_room_id,auth.uid(),phase->>'id',phase->>'label',clock_timestamp()+interval '90 seconds') RETURNING id INTO ticket;
  RETURN ticket;
END $$;
CREATE OR REPLACE FUNCTION public.end_live_debate_speech(ticket_id uuid, cancel boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.live_debate_speech_tickets SET expires_at=CASE WHEN ended_at IS NULL THEN clock_timestamp()+interval '300 seconds' ELSE expires_at END,
    ended_at=coalesce(ended_at,clock_timestamp()),consumed=cancel
  WHERE id=ticket_id AND user_id=auth.uid() AND NOT consumed AND expires_at>clock_timestamp();
END $$;

CREATE OR REPLACE FUNCTION public.submit_live_session_argument(target_room_id text, argument_id uuid, argument_content text, expected_phase_id text, speech_ticket_id uuid DEFAULT NULL, audio_path text DEFAULT NULL) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE snapshot jsonb; r public.live_debate_rooms; phase jsonb; ticket public.live_debate_speech_tickets; me public.live_debate_room_participants; registered timestamptz;
BEGIN
  snapshot := public.control_live_debate_session(target_room_id);
  SELECT * INTO r FROM public.live_debate_rooms WHERE room_id=target_room_id;
  SELECT * INTO me FROM public.live_debate_room_participants WHERE room_id=target_room_id AND user_id=auth.uid();
  SELECT created_at INTO registered FROM public.live_debate_arguments WHERE id=argument_id AND room_id=target_room_id AND user_id=auth.uid();
  IF FOUND THEN RETURN registered; END IF;
  IF r.evaluation IS NOT NULL THEN RAISE EXCEPTION 'evaluation already saved'; END IF;
  IF speech_ticket_id IS NOT NULL THEN
    SELECT * INTO ticket FROM public.live_debate_speech_tickets WHERE id=speech_ticket_id AND room_id=target_room_id AND user_id=auth.uid() AND NOT consumed AND expires_at>clock_timestamp() FOR UPDATE;
    IF ticket.id IS NULL THEN RAISE EXCEPTION 'recording expired or already submitted'; END IF;
    SELECT value INTO phase FROM jsonb_array_elements(r.session_plan) WHERE value->>'id'=ticket.phase_id;
  ELSE
    phase := r.session_plan->(snapshot->>'phase_index')::integer;
    IF snapshot->>'finished_at' IS NOT NULL OR snapshot->>'paused_at' IS NOT NULL OR phase->>'id' IS DISTINCT FROM expected_phase_id OR NOT public.live_session_can_speak(target_room_id,phase) THEN RAISE EXCEPTION 'not your speaking session'; END IF;
  END IF;
  IF audio_path IS NOT NULL AND (speech_ticket_id IS NULL OR audio_path NOT LIKE auth.uid()::text || '/' || target_room_id || '/%') THEN RAISE EXCEPTION 'invalid recording path'; END IF;
  INSERT INTO public.live_debate_arguments(id,room_id,user_id,sender_name,content,source,phase_id,phase_label,audio_path,created_at)
    VALUES(argument_id,target_room_id,auth.uid(),me.nickname,btrim(argument_content),CASE WHEN speech_ticket_id IS NULL THEN 'text' ELSE 'voice' END,phase->>'id',phase->>'label',audio_path,coalesce(ticket.created_at,clock_timestamp()))
    RETURNING created_at INTO registered;
  IF ticket.id IS NOT NULL THEN UPDATE public.live_debate_speech_tickets SET consumed=true WHERE id=ticket.id; END IF;
  RETURN registered;
END $$;

-- V2 writes must pass the session RPC. The legacy INSERT policy remains usable for v1.
CREATE OR REPLACE FUNCTION public.guard_live_session_argument() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND EXISTS(SELECT 1 FROM public.live_debate_rooms WHERE room_id=NEW.room_id AND session_config IS NOT NULL) THEN RAISE EXCEPTION 'use session argument RPC'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_live_session_argument BEFORE INSERT ON public.live_debate_arguments FOR EACH ROW EXECUTE FUNCTION public.guard_live_session_argument();

CREATE OR REPLACE FUNCTION public.send_live_team_message(target_room_id text, message_id uuid, message_body text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE key text; r public.live_debate_rooms; me public.live_debate_room_participants;
BEGIN
  SELECT * INTO r FROM public.live_debate_rooms WHERE room_id=target_room_id FOR UPDATE;
  SELECT * INTO me FROM public.live_debate_room_participants WHERE room_id=target_room_id AND user_id=auth.uid();
  key := public.live_team_key(target_room_id);
  IF key IS NULL OR r.status='closed' OR EXISTS(SELECT 1 FROM public.live_debate_sessions WHERE room_id=target_room_id AND finished_at IS NOT NULL) THEN RAISE EXCEPTION 'team chat unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM public.live_debate_team_messages WHERE id=message_id AND user_id=auth.uid()) THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.live_debate_team_messages WHERE user_id=auth.uid() AND room_id=target_room_id AND created_at>clock_timestamp()-interval '10 seconds') >= 10 THEN RAISE EXCEPTION 'please wait before sending more messages'; END IF;
  INSERT INTO public.live_debate_team_messages(id,room_id,team_key,user_id,nickname,body) VALUES(message_id,target_room_id,key,auth.uid(),me.nickname,btrim(message_body));
END $$;

CREATE OR REPLACE FUNCTION public.update_live_session_settings(target_room_id text, config jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.live_debate_rooms;
BEGIN
  SELECT * INTO r FROM public.live_debate_rooms WHERE room_id=target_room_id FOR UPDATE;
  IF auth.uid() IS NULL OR r.host_id IS DISTINCT FROM auth.uid() OR r.status <> 'open' OR r.session_config IS NULL THEN RAISE EXCEPTION 'only host can edit lobby settings'; END IF;
  PERFORM public.build_live_session_plan(config,r.team_size);
  UPDATE public.live_debate_rooms SET session_config=config,updated_at=clock_timestamp() WHERE room_id=target_room_id;
  UPDATE public.live_debate_room_participants SET is_ready=false WHERE room_id=target_room_id;
  RETURN true;
END $$;

-- Serialize readiness against room settings and starting a session.
CREATE OR REPLACE FUNCTION public.set_live_debate_ready(target_room_id text, ready boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.live_debate_rooms;
BEGIN
  SELECT * INTO r FROM public.live_debate_rooms WHERE room_id=target_room_id FOR UPDATE;
  IF auth.uid() IS NULL OR r.status <> 'open' THEN RETURN false; END IF;
  UPDATE public.live_debate_room_participants SET is_ready=ready,last_seen_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE room_id=target_room_id AND user_id=auth.uid() AND NOT is_ai;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.save_live_session_evaluation(target_room_id text, p_evaluation jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.live_debate_rooms; item jsonb; participant_id uuid;
BEGIN
  SELECT * INTO r FROM public.live_debate_rooms WHERE room_id=target_room_id FOR UPDATE;
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.live_debate_room_participants WHERE room_id=target_room_id AND user_id=auth.uid() AND NOT is_ai) THEN RAISE EXCEPTION 'not a room participant'; END IF;
  IF r.session_config IS NULL THEN RAISE EXCEPTION 'not a flexible session'; END IF;
  IF r.evaluation IS NOT NULL THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.live_debate_sessions WHERE room_id=target_room_id AND finished_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.live_debate_speech_tickets WHERE room_id=target_room_id AND NOT consumed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'wait for the session and recordings to finish'; END IF;
  IF jsonb_typeof(p_evaluation) IS DISTINCT FROM 'object' OR jsonb_typeof(p_evaluation->'participantReports') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid evaluation'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_evaluation->'participantReports') LOOP
    BEGIN participant_id := (item->>'userId')::uuid; EXCEPTION WHEN invalid_text_representation THEN CONTINUE; END;
    IF EXISTS(SELECT 1 FROM public.live_debate_room_participants WHERE room_id=target_room_id AND user_id=participant_id AND NOT is_ai AND role='debater') THEN
      INSERT INTO public.live_debate_participant_evaluations(room_id,user_id,evaluation) VALUES(target_room_id,participant_id,item)
        ON CONFLICT(room_id,user_id) DO UPDATE SET evaluation=EXCLUDED.evaluation;
    END IF;
  END LOOP;
  UPDATE public.live_debate_rooms SET evaluation=p_evaluation-'participantReports',status='closed',updated_at=clock_timestamp() WHERE room_id=target_room_id;
  RETURN true;
END $$;
ALTER FUNCTION public.save_live_debate_evaluation(text,jsonb) RENAME TO save_live_debate_evaluation_v1;
REVOKE ALL ON FUNCTION public.save_live_debate_evaluation_v1(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.save_live_debate_evaluation(target_room_id text,p_evaluation jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.live_debate_rooms WHERE room_id=target_room_id AND session_config IS NOT NULL) THEN RETURN public.save_live_session_evaluation(target_room_id,p_evaluation); END IF;
  RETURN public.save_live_debate_evaluation_v1(target_room_id,p_evaluation);
END $$;
REVOKE ALL ON FUNCTION public.update_live_session_settings(text,jsonb),public.save_live_session_evaluation(text,jsonb),public.save_live_debate_evaluation(text,jsonb),public.set_live_debate_ready(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_live_session_settings(text,jsonb),public.save_live_session_evaluation(text,jsonb),public.save_live_debate_evaluation(text,jsonb),public.set_live_debate_ready(text,boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.live_team_key(text), public.live_session_can_speak(text,jsonb), public.control_live_debate_session(text,text,integer), public.begin_live_debate_speech(text,text), public.end_live_debate_speech(uuid,boolean), public.submit_live_session_argument(text,uuid,text,text,uuid,text), public.send_live_team_message(text,uuid,text), public.choose_live_debate_team(text,text), public.set_live_debate_stage_assignment(text,text,boolean), public.start_live_debate_room(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_team_key(text), public.control_live_debate_session(text,text,integer), public.begin_live_debate_speech(text,text), public.end_live_debate_speech(uuid,boolean), public.submit_live_session_argument(text,uuid,text,text,uuid,text), public.send_live_team_message(text,uuid,text), public.choose_live_debate_team(text,text), public.set_live_debate_stage_assignment(text,text,boolean), public.start_live_debate_room(text) TO authenticated;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.live_debate_sessions; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.live_debate_team_messages; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
