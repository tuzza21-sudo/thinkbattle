-- Apply after 20261004040000_voice_lounge_round_then_free.sql.
-- App suspension preserves membership; explicit leave and room expiry still apply.
BEGIN;
ALTER TABLE public.voice_lounge_rooms ADD COLUMN IF NOT EXISTS ai_host_reason text;
ALTER TABLE public.voice_lounge_sessions ADD COLUMN IF NOT EXISTS summary_announced_stage integer NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS free_warning_announced_stage integer NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS free_ends_at timestamptz;
ALTER TABLE public.voice_lounge_sessions DROP CONSTRAINT IF EXISTS voice_lounge_sessions_state_check;
ALTER TABLE public.voice_lounge_sessions ADD CONSTRAINT voice_lounge_sessions_state_check
  CHECK(state IN ('ready','speaking','between','summarizing','free','finished'));
-- Keep already-open conversations and current speaker turns intact.
UPDATE public.voice_lounge_sessions SET free_ends_at=greatest(
  stage_started_at+make_interval(secs=>(ARRAY[180,240,420,360,360,240])[stage+1]),free_started_at+interval '60 seconds')
  WHERE state='free' AND free_started_at IS NOT NULL AND free_ends_at IS NULL;

CREATE OR REPLACE FUNCTION public.join_voice_lounge(p_room text,p_nickname text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.status='ended' OR coalesce(r.expires_at,r.created_at+interval '2 hours')<=now() THEN RAISE EXCEPTION '종료되었거나 존재하지 않는 방이에요.'; END IF;
  IF NOT public.is_voice_lounge_member(p_room) AND (SELECT count(*) FROM public.voice_lounge_members WHERE room_id=p_room AND active)>=r.capacity THEN
    RAISE EXCEPTION '방이 가득 찼어요.';
  END IF;
  INSERT INTO public.voice_lounge_members(room_id,user_id,nickname) VALUES(p_room,auth.uid(),left(trim(p_nickname),30))
    ON CONFLICT(room_id,user_id) DO UPDATE SET nickname=excluded.nickname,last_seen=now(),active=true;
END $$;


CREATE OR REPLACE FUNCTION public.control_voice_lounge(p_room text,p_action text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR NOT public.is_voice_lounge_member(p_room) THEN RAISE EXCEPTION '방 참가 권한이 없어요.'; END IF;
  IF p_action='heartbeat' THEN
    UPDATE public.voice_lounge_members SET last_seen=now() WHERE room_id=p_room AND user_id=auth.uid();
    IF coalesce(r.expires_at,r.created_at+interval '2 hours')<=now()
      THEN UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room; END IF;
  ELSIF p_action='leave' THEN
    IF r.host_id=auth.uid() THEN UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room; END IF;
    UPDATE public.voice_lounge_members SET active=false WHERE room_id=p_room AND user_id=auth.uid();
  ELSIF p_action='start' THEN
    IF r.host_id<>auth.uid() OR r.status<>'lobby' OR r.created_at+interval '2 hours'<=now() THEN RAISE EXCEPTION '방장만 유효한 대기방의 대화를 시작할 수 있어요.'; END IF;
    IF (SELECT count(*) FROM public.voice_lounge_members WHERE room_id=p_room AND active) < (CASE WHEN r.capacity=1 THEN 1 ELSE 2 END) THEN
      RAISE EXCEPTION '함께하는 방은 두 명 이상 모이면 시작할 수 있어요. 혼자 대화하려면 1:1 방을 만들어 주세요.';
    END IF;
    UPDATE public.voice_lounge_rooms SET status='active',started_at=now(),expires_at=now()+interval '1 hour' WHERE id=p_room;
  ELSIF p_action='end' THEN
    IF r.host_id<>auth.uid() THEN RAISE EXCEPTION '방장만 종료할 수 있어요.'; END IF;
    UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room;
  ELSE RAISE EXCEPTION '올바르지 않은 요청이에요.';
  END IF;
END $$;


CREATE OR REPLACE FUNCTION public.list_open_voice_lounges()
RETURNS TABLE(id text, topic text, host_persona text, theme text, capacity integer,
  status text, participant_count integer, topic_brief jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.topic, r.host_persona, r.theme, r.capacity, r.status,
    (SELECT count(*)::integer FROM public.voice_lounge_members m
      WHERE m.room_id = r.id AND m.active), r.topic_brief
  FROM public.voice_lounge_rooms r
  WHERE r.capacity > 1 AND r.status IN ('lobby', 'active')
    AND coalesce(r.expires_at, r.created_at + interval '2 hours') > now()
    AND EXISTS (SELECT 1 FROM public.voice_lounge_members h WHERE h.room_id = r.id
      AND h.user_id = r.host_id AND h.active)
  ORDER BY (r.status = 'lobby') DESC, r.created_at DESC, r.id
  LIMIT 60;
$$;

CREATE OR REPLACE FUNCTION public.control_voice_lounge_session(
  p_room text,p_action text,p_turn uuid DEFAULT NULL,p_seconds double precision DEFAULT 0
) RETURNS public.voice_lounge_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.voice_lounge_sessions; roster uuid[]; candidate uuid; changed boolean:=false;
  budget integer; elapsed double precision; rotated uuid[]; idx integer; reply jsonb;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR NOT public.is_voice_lounge_member(p_room) THEN RAISE EXCEPTION '방 참가 권한이 없어요.'; END IF;
  IF NOT r.guided_session OR r.capacity=1 OR r.status<>'active' OR r.expires_at<=now() THEN RAISE EXCEPTION '진행 중인 그룹 대화에서 사용할 수 있어요.'; END IF;
  IF p_action NOT IN ('tick','raise','lower','pass','begin','done','yield','next_stage','activity','open_free') THEN RAISE EXCEPTION '올바르지 않은 진행 요청이에요.'; END IF;
  IF p_action IN ('tick','yield','next_stage','open_free') AND r.host_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION '방장만 진행을 조정할 수 있어요.'; END IF;
  SELECT coalesce(array_agg(user_id ORDER BY joined_at,user_id),'{}'::uuid[]) INTO roster
    FROM public.voice_lounge_members WHERE room_id=p_room AND active
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

  -- Persist membership even if the browser has been suspended. A summary waits
  -- for the moderator; recover after 90 seconds if generation is unavailable.
  IF s.state='summarizing' THEN
    IF p_action='raise' AND EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND speaking_restricted_until>now()) THEN
      RAISE EXCEPTION '대화 보호를 위해 잠시 발언이 제한되어 있어요.'; END IF;
    IF p_action='open_free' THEN
      IF p_turn IS DISTINCT FROM s.turn_id OR s.summary_announced_stage<>s.stage THEN RETURN s; END IF;
      s.state:='free'; s.free_started_at:=now(); s.between_since:=NULL;
      s.free_ends_at:=greatest(s.stage_started_at+make_interval(secs=>budget),now()+interval '60 seconds');
    ELSIF p_action IN ('raise','lower') THEN
      IF p_action='raise' AND NOT auth.uid()=ANY(s.hand_queue) THEN s.hand_queue:=array_append(s.hand_queue,auth.uid());
      ELSIF p_action='lower' THEN s.hand_queue:=array_remove(s.hand_queue,auth.uid()); END IF;
    ELSIF p_action<>'tick' THEN RETURN s;
    END IF;
    IF p_action='tick' AND s.between_since<now()-interval '90 seconds' AND (r.ai_ticket_at IS NULL OR r.ai_ticket_at<=now()-interval '60 seconds') THEN
      s.state:='free'; s.free_started_at:=now();
      s.free_ends_at:=greatest(s.stage_started_at+make_interval(secs=>budget),now()+interval '60 seconds');
    END IF;
    UPDATE public.voice_lounge_sessions SET state=s.state,hand_queue=s.hand_queue,round_order=s.round_order,between_since=s.between_since,
      free_started_at=s.free_started_at,free_ends_at=s.free_ends_at,updated_at=clock_timestamp()
      WHERE room_id=p_room RETURNING * INTO s;
    RETURN s;
  END IF;
  IF p_action='open_free' THEN RETURN s; END IF;

  -- Free conversation begins only after the current topic's basic round.
  IF s.state='free' AND s.stage BETWEEN 1 AND 4 THEN
    s.free_started_at:=coalesce(s.free_started_at,now());
    s.free_ends_at:=coalesce(s.free_ends_at,greatest(s.stage_started_at+make_interval(secs=>budget),s.free_started_at+interval '60 seconds'));
    -- Manual transition also announces the ending before the next topic.
    IF p_action='next_stage' THEN s.free_ends_at:=least(s.free_ends_at,now()+interval '30 seconds'); p_action:='tick'; END IF;
    IF p_action='raise' THEN
      IF EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND speaking_restricted_until>now()) THEN
        RAISE EXCEPTION '대화 보호를 위해 잠시 발언이 제한되어 있어요.'; END IF;
      IF NOT auth.uid()=ANY(s.hand_queue) THEN s.hand_queue:=array_append(s.hand_queue,auth.uid()); END IF;
    ELSIF p_action IN ('lower','pass') THEN s.hand_queue:=array_remove(s.hand_queue,auth.uid());
    ELSIF p_action IN ('begin','done','yield','activity') THEN
      RAISE EXCEPTION '지금은 자유 대화 중이에요. 말하기 시작·종료 버튼 없이 이야기해 주세요.';
    END IF;
    IF p_action='tick' AND now()>=s.free_ends_at
      AND (s.free_warning_announced_stage=s.stage OR now()>=s.free_ends_at+interval '60 seconds') THEN
      s.stage:=s.stage+1; s.stage_started_at:=now(); s.free_started_at:=NULL; s.free_ends_at:=NULL;
      s.state:='between'; s.speaker_id:=NULL; s.completed:='{}'; s.hand_queue:='{}';
      s.reply_queue:='[]'; s.reply_question:=NULL; s.reply_from:=NULL;
      rotated:='{}';
      FOR idx IN 0..cardinality(roster)-1 LOOP rotated:=array_append(rotated,roster[1+((idx+s.stage)%cardinality(roster))]); END LOOP;
      s.round_order:=rotated; s.between_since:=NULL; p_action:='tick';
    END IF;
    IF s.state='free' THEN
      UPDATE public.voice_lounge_sessions SET stage=s.stage,state=s.state,speaker_id=NULL,turn_id=s.turn_id,
        round_order=s.round_order,completed=s.completed,hand_queue=s.hand_queue,stage_started_at=s.stage_started_at,free_started_at=s.free_started_at,free_ends_at=s.free_ends_at,
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
    ELSIF s.stage BETWEEN 1 AND 4 AND cardinality(roster)>0 THEN
      s.state:='summarizing'; s.speaker_id:=NULL; s.turn_id:=gen_random_uuid(); s.free_started_at:=NULL; s.free_ends_at:=NULL;
      s.reply_queue:='[]'; s.reply_question:=NULL; s.reply_from:=NULL;
      s.turn_started_at:=NULL; s.activity_at:=NULL; s.spoken_seconds:=0; s.nudged:=false; s.between_since:=now();
    ELSIF cardinality(s.hand_queue)>0 THEN
      candidate:=s.hand_queue[1]; s.hand_queue:=s.hand_queue[2:]; s.turn_kind:='extra';
    ELSIF cardinality(roster)=0 THEN
      s.state:='between'; s.between_since:=now();
    ELSIF s.between_since IS NOT NULL AND s.between_since<now()-interval '12 seconds' THEN
      IF s.stage=5 THEN s.state:='finished'; UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room;
      ELSE
        s.stage:=s.stage+1; s.completed:='{}'; s.stage_started_at:=now(); s.reply_queue:='[]';
        s.free_started_at:=NULL; s.free_ends_at:=NULL;
        rotated:='{}';
        FOR idx IN 0..cardinality(roster)-1 LOOP rotated:=array_append(rotated,roster[1+((idx+s.stage)%cardinality(roster))]); END LOOP;
        s.round_order:=rotated; candidate:=rotated[1]; s.turn_kind:='basic';
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
    stage_started_at=s.stage_started_at,free_started_at=s.free_started_at,free_ends_at=s.free_ends_at,turn_started_at=s.turn_started_at,spoken_seconds=s.spoken_seconds,
    activity_at=s.activity_at,nudged=s.nudged,between_since=s.between_since,updated_at=s.updated_at,
    reply_queue=s.reply_queue,reply_question=s.reply_question,reply_from=s.reply_from WHERE room_id=p_room;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.claim_voice_lounge_host(p_room text,p_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.voice_lounge_sessions; ticket uuid; live_count integer; deadline timestamptz;
BEGIN
  IF p_reason IS NULL OR p_reason NOT IN ('opening','followup','silence','requested','round_summary','free_ending') THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  SELECT count(*) INTO live_count FROM public.voice_lounge_members WHERE room_id=p_room AND active;
  IF r.id IS NULL OR r.host_id IS DISTINCT FROM auth.uid() OR NOT public.is_voice_lounge_member(p_room)
    OR r.status<>'active' OR r.expires_at<=now() OR r.ai_turns>=120
    OR r.last_ai_at>now()-(CASE WHEN live_count=1 THEN interval '5 seconds' ELSE interval '10 seconds' END)
    OR r.ai_ticket_at>now()-interval '60 seconds'
    OR EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND speaking_restricted_until>now())
    OR live_count<1 THEN RETURN NULL; END IF;
  IF r.guided_session THEN
    SELECT * INTO s FROM public.voice_lounge_sessions WHERE room_id=p_room;
    IF NOT FOUND OR s.state NOT IN ('ready','summarizing','free') THEN RETURN NULL; END IF;
    IF s.state='summarizing' AND p_reason<>'round_summary' THEN RETURN NULL; END IF;
    IF p_reason='round_summary' AND (s.state<>'summarizing' OR s.summary_announced_stage=s.stage) THEN RETURN NULL; END IF;
    IF p_reason='free_ending' THEN
      deadline:=coalesce(s.free_ends_at,greatest(s.stage_started_at+make_interval(secs=>(ARRAY[180,240,420,360,360,240])[s.stage+1]),s.free_started_at+interval '60 seconds'));
      IF s.state<>'free' OR s.free_warning_announced_stage=s.stage OR now()<deadline-interval '30 seconds' THEN RETURN NULL; END IF;
    END IF;
    IF p_reason='opening' AND s.announced_stage=s.stage THEN RETURN NULL; END IF;
    IF p_reason='silence' AND (s.state<>'free' OR r.last_ai_at>now()-(CASE WHEN live_count=1 THEN interval '45 seconds' ELSE interval '90 seconds' END)) THEN RETURN NULL; END IF;
    IF p_reason='followup' AND (live_count>1 OR s.state<>'free') THEN RETURN NULL; END IF;
  ELSIF p_reason IN ('round_summary','free_ending') THEN RETURN NULL;
  END IF;
  IF live_count>1 AND p_reason='followup' THEN RETURN NULL; END IF;
  IF r.capacity>1 AND NOT r.guided_session AND p_reason='opening' AND EXISTS(
    SELECT 1 FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='host') THEN RETURN NULL; END IF;
  ticket:=gen_random_uuid();
  UPDATE public.voice_lounge_rooms SET ai_ticket=ticket,ai_ticket_at=now(),last_ai_at=now(),ai_turns=ai_turns+1,
    ai_session_turn=CASE WHEN r.guided_session THEN s.turn_id ELSE NULL END,ai_host_reason=p_reason WHERE id=p_room;
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
    SELECT * INTO s FROM public.voice_lounge_sessions WHERE room_id=p_room FOR UPDATE;
    IF NOT FOUND OR s.turn_id IS DISTINCT FROM r.ai_session_turn OR s.state NOT IN ('ready','summarizing','free')
      OR (r.ai_host_reason='round_summary' AND s.state<>'summarizing')
      OR (r.ai_host_reason='free_ending' AND s.state<>'free') THEN
      UPDATE public.voice_lounge_rooms SET ai_ticket=NULL,ai_ticket_at=NULL,ai_host_reason=NULL WHERE id=p_room;
      RETURN false;
    END IF;
  END IF;
  IF length(trim(p_text)) NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'invalid host response'; END IF;
  INSERT INTO public.voice_lounge_messages(room_id,nickname,kind,text) VALUES(p_room,'AI 사회자','host',trim(p_text));
  UPDATE public.voice_lounge_rooms SET memory=left(p_memory,1800),ai_ticket=NULL,ai_ticket_at=NULL,ai_host_reason=NULL,
    moderator_requested_at=CASE WHEN r.ai_host_reason='requested' AND moderator_requested_at<=r.ai_ticket_at THEN NULL ELSE moderator_requested_at END,
    moderator_requested_by=CASE WHEN r.ai_host_reason='requested' AND moderator_requested_at<=r.ai_ticket_at THEN NULL ELSE moderator_requested_by END WHERE id=p_room;
  IF r.guided_session THEN
    IF r.ai_host_reason='opening' THEN
      UPDATE public.voice_lounge_sessions SET announced_turn=s.turn_id,announced_stage=s.stage,updated_at=clock_timestamp() WHERE room_id=p_room;
    ELSIF r.ai_host_reason='round_summary' THEN
      -- Keep participant microphones closed until the owner finishes playback.
      UPDATE public.voice_lounge_sessions SET summary_announced_stage=s.stage,updated_at=clock_timestamp() WHERE room_id=p_room;
    ELSIF r.ai_host_reason='free_ending' THEN
      UPDATE public.voice_lounge_sessions SET free_warning_announced_stage=s.stage,
        free_ends_at=greatest(coalesce(free_ends_at,now()),now()+interval '10 seconds'),updated_at=clock_timestamp() WHERE room_id=p_room;
    END IF;
  END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.join_voice_lounge(text,text),public.control_voice_lounge(text,text),
  public.control_voice_lounge_session(text,text,uuid,double precision),public.claim_voice_lounge_host(text,text),
  public.finish_voice_lounge_host(text,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.join_voice_lounge(text,text),public.control_voice_lounge(text,text),
  public.control_voice_lounge_session(text,text,uuid,double precision),public.claim_voice_lounge_host(text,text),
  public.finish_voice_lounge_host(text,uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.list_open_voice_lounges() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_open_voice_lounges() TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

