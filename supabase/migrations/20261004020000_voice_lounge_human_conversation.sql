-- Apply after 20261004010000_voice_lounge_film_discussion_cards.sql.
-- Human conversation is free; only introduction/closing rounds reserve turns.
BEGIN;
ALTER TABLE public.voice_lounge_sessions ADD COLUMN IF NOT EXISTS announced_stage integer NOT NULL DEFAULT -1;
ALTER TABLE public.voice_lounge_sessions DROP CONSTRAINT IF EXISTS voice_lounge_sessions_state_check;
ALTER TABLE public.voice_lounge_sessions ADD CONSTRAINT voice_lounge_sessions_state_check
  CHECK(state IN ('ready','speaking','between','free','finished'));
ALTER TABLE public.voice_lounge_rooms ADD COLUMN IF NOT EXISTS moderator_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderator_requested_by uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.is_voice_lounge_moderator_request(p_text text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT coalesce(p_text ~* '^(AI[[:space:]]*(사회자)?|사회자)(님|야|아|는|도)?[[:space:],:]'
    AND p_text ~ '(어떻게|생각|질문|도와|알려|설명|의견|궁금|추천|정리|말해|해줘)',false);
$$;
CREATE OR REPLACE FUNCTION public.request_voice_lounge_moderator(p_room text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM 1 FROM public.voice_lounge_rooms WHERE id=p_room AND status='active' AND expires_at>now() FOR UPDATE;
  IF NOT FOUND OR NOT public.is_voice_lounge_member(p_room) THEN RAISE EXCEPTION '진행 중인 방에서만 사회자를 부를 수 있어요.'; END IF;
  IF EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND speaking_restricted_until>now()) THEN
    RAISE EXCEPTION '대화 보호를 위해 잠시 발언이 제한되어 있어요.'; END IF;
  UPDATE public.voice_lounge_rooms SET moderator_requested_at=now(),moderator_requested_by=auth.uid()
    WHERE id=p_room AND moderator_requested_at IS NULL;
END $$;


CREATE OR REPLACE FUNCTION public.control_voice_lounge_session(
  p_room text,p_action text,p_turn uuid DEFAULT NULL,p_seconds double precision DEFAULT 0
) RETURNS public.voice_lounge_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.voice_lounge_sessions; roster uuid[]; candidate uuid; changed boolean:=false;
  budget integer; elapsed double precision; rotated uuid[]; idx integer; reply jsonb;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR NOT public.is_voice_lounge_member(p_room) THEN RAISE EXCEPTION '방 참가 권한이 없어요.'; END IF;
  IF NOT r.guided_session OR r.capacity=1 OR r.status<>'active' OR r.expires_at<=now() THEN RAISE EXCEPTION '진행 중인 그룹 대화에서 사용할 수 있어요.'; END IF;
  IF p_action NOT IN ('tick','raise','lower','pass','begin','done','yield','next_stage','activity') THEN RAISE EXCEPTION '올바르지 않은 진행 요청이에요.'; END IF;
  IF p_action IN ('tick','yield','next_stage') AND r.host_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION '방장만 진행을 조정할 수 있어요.'; END IF;
  SELECT coalesce(array_agg(user_id ORDER BY joined_at,user_id),'{}'::uuid[]) INTO roster
    FROM public.voice_lounge_members WHERE room_id=p_room AND active AND last_seen>now()-interval '90 seconds'
      AND (speaking_restricted_until IS NULL OR speaking_restricted_until<=now());
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

  -- Only introductions and the closing round reserve an exclusive floor.
  IF s.stage BETWEEN 1 AND 4 THEN
    IF s.state<>'free' THEN
      UPDATE public.voice_lounge_session_turns SET ended_at=coalesce(ended_at,now()) WHERE id=s.turn_id;
      s.state:='free'; s.speaker_id:=NULL; s.turn_id:=gen_random_uuid();
      s.round_order:='{}'; s.completed:='{}'; s.reply_queue:='[]'; s.reply_question:=NULL; s.reply_from:=NULL;
      s.turn_started_at:=NULL; s.activity_at:=NULL; s.spoken_seconds:=0; s.nudged:=false; s.between_since:=NULL;
    END IF;
    IF p_action='raise' THEN
      IF EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND speaking_restricted_until>now()) THEN
        RAISE EXCEPTION '대화 보호를 위해 잠시 발언이 제한되어 있어요.'; END IF;
      IF NOT auth.uid()=ANY(s.hand_queue) THEN s.hand_queue:=array_append(s.hand_queue,auth.uid()); END IF;
    ELSIF p_action IN ('lower','pass') THEN s.hand_queue:=array_remove(s.hand_queue,auth.uid());
    ELSIF p_action IN ('begin','done','yield','activity') THEN
      RAISE EXCEPTION '지금은 자유 대화 중이에요. 말하기 시작·종료 버튼 없이 이야기해 주세요.';
    END IF;
    IF p_action='next_stage' OR (p_action='tick' AND now()>=s.stage_started_at+make_interval(secs=>budget)) THEN
      s.stage:=s.stage+1; s.stage_started_at:=now(); s.turn_id:=gen_random_uuid(); s.hand_queue:='{}';
      IF s.stage=5 THEN s.state:='between'; s.round_order:=roster; s.completed:='{}'; p_action:='tick'; END IF;
    END IF;
    IF s.state='free' THEN
      UPDATE public.voice_lounge_sessions SET stage=s.stage,state=s.state,speaker_id=NULL,turn_id=s.turn_id,
        round_order='{}',completed='{}',hand_queue=s.hand_queue,stage_started_at=s.stage_started_at,
        turn_started_at=NULL,activity_at=NULL,spoken_seconds=0,nudged=false,between_since=NULL,
        reply_queue='[]',reply_question=NULL,reply_from=NULL,updated_at=clock_timestamp()
        WHERE room_id=p_room RETURNING * INTO s;
      RETURN s;
    END IF;
  END IF;


  IF p_action IN ('raise','begin','activity') AND EXISTS(SELECT 1 FROM public.voice_lounge_members
    WHERE room_id=p_room AND user_id=auth.uid() AND speaking_restricted_until>now()) THEN
    RAISE EXCEPTION '대화 보호를 위해 잠시 발언이 제한되어 있어요.'; END IF;
  s.reply_queue:=coalesce((SELECT jsonb_agg(q) FROM jsonb_array_elements(s.reply_queue) q
    WHERE (q->>'target')::uuid=ANY(roster) AND (q->>'stage')::integer=s.stage),'[]'::jsonb);
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
    IF s.speaker_id IS NOT NULL OR NOT s.completed @> s.round_order OR cardinality(s.hand_queue)>0 OR jsonb_array_length(s.reply_queue)>0 THEN
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
    s.reply_question:=NULL; s.reply_from:=NULL;
  END IF;
  IF s.speaker_id IS NULL THEN
    reply:=NULL; candidate:=NULL;
    SELECT q INTO reply FROM jsonb_array_elements(s.reply_queue) q
      WHERE EXISTS(SELECT 1 FROM public.voice_lounge_session_turns t WHERE t.id=(q->>'source_turn')::uuid AND t.ended_at IS NOT NULL) LIMIT 1;
    IF reply IS NOT NULL THEN
      candidate:=(reply->>'target')::uuid; s.turn_kind:='reply';
      s.reply_question:=reply->>'question'; s.reply_from:=(reply->>'from')::uuid;
      s.reply_queue:=coalesce((SELECT jsonb_agg(q) FROM jsonb_array_elements(s.reply_queue) q WHERE q<>reply),'[]'::jsonb);
    ELSE
      SELECT id INTO candidate FROM unnest(s.round_order) id WHERE NOT id=ANY(s.completed) LIMIT 1;
      IF candidate IS NOT NULL THEN s.turn_kind:='basic'; END IF;
    END IF;
    IF candidate IS NOT NULL THEN NULL;
    ELSIF cardinality(s.hand_queue)>0 THEN
      candidate:=s.hand_queue[1]; s.hand_queue:=s.hand_queue[2:]; s.turn_kind:='extra';
    ELSIF cardinality(roster)=0 THEN
      s.state:='between'; s.between_since:=now();
    ELSIF s.between_since IS NOT NULL AND s.between_since<now()-interval '12 seconds' THEN
      IF s.stage=5 THEN s.state:='finished'; UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room;
      ELSE
        s.stage:=s.stage+1; s.completed:='{}'; s.stage_started_at:=now(); s.reply_queue:='[]';
        IF s.stage BETWEEN 1 AND 4 THEN
          s.state:='free'; s.round_order:='{}'; s.turn_id:=gen_random_uuid(); s.between_since:=NULL;
        ELSE
        rotated:='{}';
        FOR idx IN 0..cardinality(roster)-1 LOOP rotated:=array_append(rotated,roster[1+((idx+s.stage)%cardinality(roster))]); END LOOP;
        s.round_order:=rotated; candidate:=rotated[1]; s.turn_kind:='basic';
        END IF;
      END IF;
    ELSE s.state:='between'; s.between_since:=coalesce(s.between_since,now());
    END IF;
    IF candidate IS NOT NULL THEN
      s.speaker_id:=candidate; s.state:='ready'; s.turn_id:=gen_random_uuid(); s.turn_started_at:=NULL;
      s.spoken_seconds:=0; s.activity_at:=NULL; s.nudged:=false; s.between_since:=NULL;
      INSERT INTO public.voice_lounge_session_turns(id,room_id,speaker_id,stage,kind,source_turn) VALUES(s.turn_id,p_room,candidate,s.stage,s.turn_kind,CASE WHEN reply IS NOT NULL THEN (reply->>'source_turn')::uuid ELSE NULL END);
    END IF;
  END IF;
  s.updated_at:=now();
  UPDATE public.voice_lounge_sessions SET stage=s.stage,state=s.state,speaker_id=s.speaker_id,turn_id=s.turn_id,
    turn_kind=s.turn_kind,round_order=s.round_order,completed=s.completed,hand_queue=s.hand_queue,
    stage_started_at=s.stage_started_at,turn_started_at=s.turn_started_at,spoken_seconds=s.spoken_seconds,
    activity_at=s.activity_at,nudged=s.nudged,between_since=s.between_since,updated_at=s.updated_at,
    reply_queue=s.reply_queue,reply_question=s.reply_question,reply_from=s.reply_from WHERE room_id=p_room;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.post_voice_lounge_message(p_room text,p_text text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; n text;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.status<>'active' OR r.expires_at<=now() OR NOT public.is_voice_lounge_member(p_room) THEN RAISE EXCEPTION '진행 중인 방에서만 이야기할 수 있어요.'; END IF;
  IF EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND speaking_restricted_until>now()) THEN
    RAISE EXCEPTION '대화 보호를 위해 잠시 발언이 제한되어 있어요.'; END IF;
  IF length(trim(p_text)) NOT BETWEEN 1 AND 1200 THEN RAISE EXCEPTION '이야기는 1~1200자로 입력해 주세요.'; END IF;
  IF EXISTS(SELECT 1 FROM public.voice_lounge_messages WHERE room_id=p_room AND user_id=auth.uid() AND created_at>now()-interval '2 seconds') THEN RAISE EXCEPTION '조금만 천천히 이야기해 주세요.'; END IF;
  SELECT nickname INTO n FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid();
  INSERT INTO public.voice_lounge_messages(room_id,user_id,nickname,kind,text) VALUES(p_room,auth.uid(),n,'human',trim(p_text));
  IF public.is_voice_lounge_moderator_request(trim(p_text)) THEN
    UPDATE public.voice_lounge_rooms SET moderator_requested_at=now(),moderator_requested_by=auth.uid()
      WHERE id=p_room AND moderator_requested_at IS NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.claim_voice_lounge_host(p_room text,p_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.voice_lounge_sessions; ticket uuid; live_count integer;
BEGIN
  IF p_reason IS NULL OR p_reason NOT IN ('opening','followup','silence','requested') THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  SELECT count(*) INTO live_count FROM public.voice_lounge_members WHERE room_id=p_room AND active AND last_seen>now()-interval '45 seconds';
  IF r.id IS NULL OR r.host_id IS DISTINCT FROM auth.uid() OR NOT public.is_voice_lounge_member(p_room)
    OR r.status<>'active' OR r.expires_at<=now() OR r.ai_turns>=120
    OR r.last_ai_at>now()-(CASE WHEN live_count=1 THEN interval '5 seconds' ELSE interval '10 seconds' END)
    OR r.ai_ticket_at>now()-interval '60 seconds'
    OR EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND speaking_restricted_until>now())
    OR live_count<1 THEN RETURN NULL; END IF;
  IF r.guided_session THEN
    SELECT * INTO s FROM public.voice_lounge_sessions WHERE room_id=p_room;
    IF NOT FOUND OR s.state NOT IN ('ready','free') THEN RETURN NULL; END IF;
    IF p_reason='opening' AND (s.stage NOT IN (0,1,5) OR s.announced_stage=s.stage) THEN RETURN NULL; END IF;
    IF p_reason='silence' AND (s.state<>'free' OR r.last_ai_at>now()-(CASE WHEN live_count=1 THEN interval '45 seconds' ELSE interval '90 seconds' END)) THEN RETURN NULL; END IF;
    IF p_reason='followup' AND (live_count>1 OR s.state<>'free') THEN RETURN NULL; END IF;
  END IF;
  IF live_count>1 AND p_reason='followup' THEN RETURN NULL; END IF;
  IF r.capacity>1 AND NOT r.guided_session AND p_reason='opening' AND EXISTS(
    SELECT 1 FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='host') THEN RETURN NULL; END IF;
  ticket:=gen_random_uuid();
  UPDATE public.voice_lounge_rooms SET ai_ticket=ticket,ai_ticket_at=now(),last_ai_at=now(),ai_turns=ai_turns+1,
    ai_session_turn=CASE WHEN r.guided_session THEN s.turn_id ELSE NULL END WHERE id=p_room;
  RETURN ticket;
END $$;

CREATE OR REPLACE FUNCTION public.claim_voice_lounge_host(p_room text) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT public.claim_voice_lounge_host(p_room,'opening');
$$;


CREATE OR REPLACE FUNCTION public.finish_voice_lounge_host(p_room text,p_ticket uuid,p_text text,p_memory text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.voice_lounge_sessions;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.host_id IS DISTINCT FROM auth.uid() OR r.ai_ticket IS DISTINCT FROM p_ticket
    OR r.status<>'active' OR r.expires_at<=now() OR r.ai_ticket_at<now()-interval '60 seconds' THEN RETURN false; END IF;
  IF r.guided_session THEN
    SELECT * INTO s FROM public.voice_lounge_sessions WHERE room_id=p_room;
    IF NOT FOUND OR s.turn_id IS DISTINCT FROM r.ai_session_turn OR s.state NOT IN ('ready','free') THEN
      UPDATE public.voice_lounge_rooms SET ai_ticket=NULL,ai_ticket_at=NULL WHERE id=p_room;
      RETURN false;
    END IF;
  END IF;
  IF length(trim(p_text)) NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'invalid host response'; END IF;
  INSERT INTO public.voice_lounge_messages(room_id,nickname,kind,text) VALUES(p_room,'AI 사회자','host',trim(p_text));
  UPDATE public.voice_lounge_rooms SET memory=left(p_memory,1800),ai_ticket=NULL,ai_ticket_at=NULL,
    moderator_requested_at=CASE WHEN moderator_requested_at<=r.ai_ticket_at THEN NULL ELSE moderator_requested_at END,
    moderator_requested_by=CASE WHEN moderator_requested_at<=r.ai_ticket_at THEN NULL ELSE moderator_requested_by END WHERE id=p_room;
  IF r.guided_session THEN UPDATE public.voice_lounge_sessions SET announced_turn=s.turn_id,announced_stage=s.stage WHERE room_id=p_room; END IF;
  RETURN true;
END $$;

-- Upgrade active middle rounds without interrupting introduction/closing turns.
UPDATE public.voice_lounge_session_turns t SET ended_at=now() FROM public.voice_lounge_sessions s
  JOIN public.voice_lounge_rooms r ON r.id=s.room_id
  WHERE t.id=s.turn_id AND t.ended_at IS NULL AND s.stage BETWEEN 1 AND 4
    AND r.status='active' AND r.expires_at>now();
UPDATE public.voice_lounge_sessions s SET state='free',speaker_id=NULL,turn_id=gen_random_uuid(),
  round_order='{}',completed='{}',hand_queue='{}',reply_queue='[]',reply_question=NULL,reply_from=NULL,
  turn_started_at=NULL,activity_at=NULL,spoken_seconds=0,nudged=false,between_since=NULL,updated_at=clock_timestamp()
  FROM public.voice_lounge_rooms r WHERE r.id=s.room_id AND s.stage BETWEEN 1 AND 4 AND s.state<>'free'
    AND r.status='active' AND r.expires_at>now();
-- Already introduced stages should not repeat their announcement on migration.
UPDATE public.voice_lounge_sessions SET announced_stage=stage WHERE announced_stage=-1 AND announced_turn IS NOT NULL;
REVOKE ALL ON FUNCTION public.is_voice_lounge_moderator_request(text),public.request_voice_lounge_moderator(text),
  public.claim_voice_lounge_host(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_voice_lounge_moderator_request(text),public.request_voice_lounge_moderator(text),
  public.claim_voice_lounge_host(text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
