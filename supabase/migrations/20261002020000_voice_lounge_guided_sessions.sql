-- Group rooms created after this migration use flexible, roughly 30-minute rounds.
BEGIN;
ALTER TABLE public.voice_lounge_rooms ADD COLUMN IF NOT EXISTS guided_session boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_session_turn uuid;
CREATE TABLE IF NOT EXISTS public.voice_lounge_sessions (
  room_id text PRIMARY KEY REFERENCES public.voice_lounge_rooms(id) ON DELETE CASCADE,
  stage integer NOT NULL DEFAULT 0 CHECK(stage BETWEEN 0 AND 5),
  state text NOT NULL DEFAULT 'between' CHECK(state IN ('ready','speaking','between','finished')),
  speaker_id uuid REFERENCES auth.users(id), turn_id uuid NOT NULL DEFAULT gen_random_uuid(),
  turn_kind text NOT NULL DEFAULT 'basic' CHECK(turn_kind IN ('basic','extra')),
  round_order uuid[] NOT NULL DEFAULT '{}', completed uuid[] NOT NULL DEFAULT '{}', hand_queue uuid[] NOT NULL DEFAULT '{}',
  started_at timestamptz NOT NULL DEFAULT now(), stage_started_at timestamptz NOT NULL DEFAULT now(),
  turn_started_at timestamptz, spoken_seconds double precision NOT NULL DEFAULT 0 CHECK(spoken_seconds>=0),
  activity_at timestamptz, nudged boolean NOT NULL DEFAULT false, announced_turn uuid,
  between_since timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.voice_lounge_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lounge_session_read ON public.voice_lounge_sessions;
CREATE POLICY lounge_session_read ON public.voice_lounge_sessions FOR SELECT TO authenticated USING(public.is_voice_lounge_member(room_id));
REVOKE ALL ON public.voice_lounge_sessions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.voice_lounge_sessions TO authenticated;
CREATE TABLE IF NOT EXISTS public.voice_lounge_session_turns (
  id uuid PRIMARY KEY, room_id text NOT NULL REFERENCES public.voice_lounge_rooms(id) ON DELETE CASCADE,
  speaker_id uuid NOT NULL REFERENCES auth.users(id), stage integer NOT NULL,
  started_at timestamptz, ended_at timestamptz
);
ALTER TABLE public.voice_lounge_session_turns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lounge_turn_read ON public.voice_lounge_session_turns;
CREATE POLICY lounge_turn_read ON public.voice_lounge_session_turns FOR SELECT TO authenticated USING(public.is_voice_lounge_member(room_id));
REVOKE ALL ON public.voice_lounge_session_turns FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.voice_lounge_session_turns TO authenticated;
ALTER TABLE public.voice_lounge_messages ADD COLUMN IF NOT EXISTS turn_id uuid REFERENCES public.voice_lounge_session_turns(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.create_voice_lounge(
  p_persona text,p_topic text,p_capacity integer,p_nickname text,p_theme text,p_study_required boolean
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE room_id text;
BEGIN
  room_id:=public.create_voice_lounge(p_persona,p_topic,p_capacity,p_nickname,p_theme);
  UPDATE public.voice_lounge_rooms SET study_required=coalesce(p_study_required,false),guided_session=p_capacity>1 WHERE id=room_id;
  RETURN room_id;
END $$;

-- Serialize every queue mutation with the same room lock used by room controls.
CREATE OR REPLACE FUNCTION public.control_voice_lounge_session(
  p_room text,p_action text,p_turn uuid DEFAULT NULL,p_seconds double precision DEFAULT 0
) RETURNS public.voice_lounge_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.voice_lounge_sessions; roster uuid[]; candidate uuid; changed boolean:=false;
  budget integer; elapsed double precision; rotated uuid[]; idx integer;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR NOT public.is_voice_lounge_member(p_room) THEN RAISE EXCEPTION '방 참가 권한이 없어요.'; END IF;
  IF NOT r.guided_session OR r.capacity=1 OR r.status<>'active' OR r.expires_at<=now() THEN RAISE EXCEPTION '진행 중인 그룹 대화에서 사용할 수 있어요.'; END IF;
  IF p_action NOT IN ('tick','raise','lower','pass','begin','done','yield','next_stage','activity') THEN RAISE EXCEPTION '올바르지 않은 진행 요청이에요.'; END IF;
  IF p_action IN ('tick','yield','next_stage') AND r.host_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION '방장만 진행을 조정할 수 있어요.'; END IF;
  SELECT coalesce(array_agg(user_id ORDER BY joined_at,user_id),'{}'::uuid[]) INTO roster
    FROM public.voice_lounge_members WHERE room_id=p_room AND active AND last_seen>now()-interval '90 seconds';
  INSERT INTO public.voice_lounge_sessions(room_id,started_at,stage_started_at,round_order)
    VALUES(p_room,r.started_at,now(),roster) ON CONFLICT DO NOTHING;
  SELECT * INTO s FROM public.voice_lounge_sessions WHERE room_id=p_room FOR UPDATE;
  IF s.state='finished' THEN RETURN s; END IF;
  -- Mid-round arrivals go to the end; departed users do not stall the queue.
  s.round_order:=ARRAY(SELECT id FROM unnest(s.round_order) id WHERE id=ANY(roster));
  FOREACH candidate IN ARRAY roster LOOP
    IF NOT candidate=ANY(s.round_order) THEN s.round_order:=array_append(s.round_order,candidate); END IF;
  END LOOP;
  s.hand_queue:=ARRAY(SELECT id FROM unnest(s.hand_queue) id WHERE id=ANY(roster));
  budget:=(ARRAY[180,240,420,360,360,240])[s.stage+1];

  IF p_action='raise' THEN
    IF now()>s.stage_started_at+make_interval(secs=>budget) AND s.completed @> s.round_order THEN
      RAISE EXCEPTION '이번 이야기를 마무리하고 있어요. 다음 주제에서 손을 들어 주세요.';
    END IF;
    IF NOT auth.uid()=ANY(s.hand_queue) THEN s.hand_queue:=array_append(s.hand_queue,auth.uid()); END IF;
  ELSIF p_action='lower' THEN s.hand_queue:=array_remove(s.hand_queue,auth.uid());
  ELSIF p_action='pass' THEN
    IF s.speaker_id=auth.uid() THEN
      IF p_turn IS DISTINCT FROM s.turn_id THEN RETURN s; END IF;
      changed:=true;
    ELSIF NOT auth.uid()=ANY(s.completed) THEN s.completed:=array_append(s.completed,auth.uid()); END IF;
    s.hand_queue:=array_remove(s.hand_queue,auth.uid());
  ELSIF p_action IN ('begin','done','activity') THEN
    IF s.speaker_id IS DISTINCT FROM auth.uid() OR p_turn IS DISTINCT FROM s.turn_id THEN RETURN s; END IF;
    IF p_action='begin' AND s.state='ready' THEN
      s.state:='speaking'; s.turn_started_at:=now(); s.activity_at:=now();
      UPDATE public.voice_lounge_session_turns SET started_at=now() WHERE id=s.turn_id;
    ELSIF p_action='done' THEN changed:=true;
    ELSIF p_action='activity' AND s.state='speaking' THEN
      IF p_seconds IS NULL OR p_seconds<0 OR p_seconds>10 OR p_seconds='NaN'::float8 THEN RAISE EXCEPTION '발언 시간 정보를 확인해 주세요.'; END IF;
      elapsed:=greatest(0,extract(epoch FROM now()-coalesce(s.activity_at,s.turn_started_at)));
      s.spoken_seconds:=s.spoken_seconds+least(p_seconds,elapsed,10);
      s.activity_at:=now(); s.nudged:=s.spoken_seconds>=120;
      IF s.spoken_seconds>=210 THEN changed:=true; END IF;
    END IF;
  ELSIF p_action='yield' THEN
    IF p_turn IS DISTINCT FROM s.turn_id THEN RETURN s; END IF;
    changed:=s.speaker_id IS NOT NULL;
  ELSIF p_action='next_stage' THEN
    IF s.speaker_id IS NOT NULL OR NOT s.completed @> s.round_order OR cardinality(s.hand_queue)>0 THEN
      RAISE EXCEPTION '아직 차례를 기다리는 분이 있어요. 먼저 이야기를 듣거나 패스해 주세요.';
    END IF;
    s.between_since:=now()-interval '13 seconds';
  END IF;
  IF s.speaker_id IS NOT NULL AND NOT s.speaker_id=ANY(roster) THEN changed:=true; END IF;
  -- No short countdown. A stalled microphone can still be recovered by the host.
  IF s.state='speaking' AND s.turn_started_at<now()-interval '5 minutes' THEN changed:=true; END IF;
  IF changed THEN
    UPDATE public.voice_lounge_session_turns SET ended_at=now() WHERE id=s.turn_id;
    IF s.turn_kind='basic' AND NOT s.speaker_id=ANY(s.completed) THEN s.completed:=array_append(s.completed,s.speaker_id); END IF;
    s.speaker_id:=NULL; s.state:='between'; s.between_since:=now();
  END IF;
  IF s.speaker_id IS NULL THEN
    SELECT id INTO candidate FROM unnest(s.round_order) id WHERE NOT id=ANY(s.completed) LIMIT 1;
    IF candidate IS NOT NULL THEN s.turn_kind:='basic';
    ELSIF cardinality(s.hand_queue)>0 THEN
      candidate:=s.hand_queue[1]; s.hand_queue:=s.hand_queue[2:]; s.turn_kind:='extra';
    ELSIF s.between_since IS NOT NULL AND s.between_since<now()-interval '12 seconds' THEN
      IF s.stage=5 THEN s.state:='finished'; UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room;
      ELSE
        s.stage:=s.stage+1; s.completed:='{}'; s.stage_started_at:=now();
        rotated:='{}';
        FOR idx IN 0..cardinality(roster)-1 LOOP rotated:=array_append(rotated,roster[1+((idx+s.stage)%cardinality(roster))]); END LOOP;
        s.round_order:=rotated; candidate:=rotated[1]; s.turn_kind:='basic';
      END IF;
    ELSE s.state:='between'; s.between_since:=coalesce(s.between_since,now());
    END IF;
    IF candidate IS NOT NULL THEN
      s.speaker_id:=candidate; s.state:='ready'; s.turn_id:=gen_random_uuid(); s.turn_started_at:=NULL;
      s.spoken_seconds:=0; s.activity_at:=NULL; s.nudged:=false; s.between_since:=NULL;
      INSERT INTO public.voice_lounge_session_turns(id,room_id,speaker_id,stage) VALUES(s.turn_id,p_room,candidate,s.stage);
    END IF;
  END IF;
  s.updated_at:=now();
  UPDATE public.voice_lounge_sessions SET stage=s.stage,state=s.state,speaker_id=s.speaker_id,turn_id=s.turn_id,
    turn_kind=s.turn_kind,round_order=s.round_order,completed=s.completed,hand_queue=s.hand_queue,
    stage_started_at=s.stage_started_at,turn_started_at=s.turn_started_at,spoken_seconds=s.spoken_seconds,
    activity_at=s.activity_at,nudged=s.nudged,between_since=s.between_since,updated_at=s.updated_at WHERE room_id=p_room;
  RETURN s;
END $$;

-- Late transcription stays attached to its original turn, never the new speaker.
CREATE OR REPLACE FUNCTION public.claim_voice_lounge_turn_audio(p_room text,p_turn uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.status<>'active' OR r.expires_at<=now() OR NOT r.guided_session THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.voice_lounge_session_turns WHERE id=p_turn AND room_id=p_room AND speaker_id=auth.uid()
    AND started_at IS NOT NULL AND (ended_at IS NULL OR ended_at>now()-interval '60 seconds')) THEN RETURN false; END IF;
  UPDATE public.voice_lounge_members SET audio_requests=audio_requests+1,last_audio_at=now()
    WHERE room_id=p_room AND user_id=auth.uid() AND active AND audio_requests<240
    AND last_seen>now()-interval '45 seconds' AND (last_audio_at IS NULL OR last_audio_at<now()-interval '2 seconds');
  RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public.post_voice_lounge_turn_message(p_room text,p_turn uuid,p_text text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.voice_lounge_session_turns WHERE id=p_turn AND room_id=p_room AND speaker_id=auth.uid()
    AND started_at IS NOT NULL AND (ended_at IS NULL OR ended_at>now()-interval '90 seconds')) THEN RAISE EXCEPTION '발언 차례를 확인해 주세요.'; END IF;
  PERFORM public.post_voice_lounge_message(p_room,p_text);
  UPDATE public.voice_lounge_messages SET turn_id=p_turn WHERE id=(SELECT id FROM public.voice_lounge_messages
    WHERE room_id=p_room AND user_id=auth.uid() AND created_at=now() ORDER BY id DESC LIMIT 1);
END $$;

CREATE OR REPLACE FUNCTION public.claim_voice_lounge_host(p_room text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.voice_lounge_sessions; ticket uuid;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.host_id IS DISTINCT FROM auth.uid() OR NOT public.is_voice_lounge_member(p_room)
    OR r.status<>'active' OR r.expires_at<=now() OR r.ai_turns>=120
    OR r.last_ai_at>now()-(CASE WHEN r.capacity=1 OR r.guided_session THEN interval '5 seconds' ELSE interval '30 seconds' END)
    OR r.ai_ticket_at>now()-interval '60 seconds'
    OR (SELECT count(*) FROM public.voice_lounge_members WHERE room_id=p_room AND active AND last_seen>now()-interval '45 seconds')<(CASE WHEN r.capacity=1 THEN 1 ELSE 2 END) THEN RETURN NULL; END IF;
  IF r.guided_session THEN
    SELECT * INTO s FROM public.voice_lounge_sessions WHERE room_id=p_room;
    IF NOT FOUND OR s.state<>'ready' OR s.announced_turn=s.turn_id THEN RETURN NULL; END IF;
  END IF;
  ticket:=gen_random_uuid();
  UPDATE public.voice_lounge_rooms SET ai_ticket=ticket,ai_ticket_at=now(),last_ai_at=now(),ai_turns=ai_turns+1,
    ai_session_turn=CASE WHEN r.guided_session THEN s.turn_id ELSE NULL END WHERE id=p_room;
  RETURN ticket;
END $$;

CREATE OR REPLACE FUNCTION public.finish_voice_lounge_host(p_room text,p_ticket uuid,p_text text,p_memory text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.voice_lounge_sessions;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.host_id IS DISTINCT FROM auth.uid() OR r.ai_ticket IS DISTINCT FROM p_ticket
    OR r.status<>'active' OR r.expires_at<=now() OR r.ai_ticket_at<now()-interval '60 seconds' THEN RETURN false; END IF;
  IF r.guided_session THEN
    SELECT * INTO s FROM public.voice_lounge_sessions WHERE room_id=p_room;
    IF NOT FOUND OR s.turn_id IS DISTINCT FROM r.ai_session_turn OR s.state<>'ready' THEN
      UPDATE public.voice_lounge_rooms SET ai_ticket=NULL,ai_ticket_at=NULL WHERE id=p_room;
      RETURN false;
    END IF;
  END IF;
  IF length(trim(p_text)) NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'invalid host response'; END IF;
  INSERT INTO public.voice_lounge_messages(room_id,nickname,kind,text) VALUES(p_room,'AI 사회자','host',trim(p_text));
  UPDATE public.voice_lounge_rooms SET memory=left(p_memory,1800),ai_ticket=NULL,ai_ticket_at=NULL WHERE id=p_room;
  IF r.guided_session THEN UPDATE public.voice_lounge_sessions SET announced_turn=s.turn_id WHERE room_id=p_room; END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.control_voice_lounge_session(text,text,uuid,double precision) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.control_voice_lounge_session(text,text,uuid,double precision) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_voice_lounge_turn_audio(text,uuid),public.post_voice_lounge_turn_message(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_voice_lounge_turn_audio(text,uuid),public.post_voice_lounge_turn_message(text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.create_voice_lounge(text,text,integer,text,text,boolean),public.claim_voice_lounge_host(text),public.finish_voice_lounge_host(text,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_voice_lounge(text,text,integer,text,text,boolean),public.claim_voice_lounge_host(text),public.finish_voice_lounge_host(text,uuid,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
