-- Apply after 20261002040000_voice_lounge_cafe_and_seaside.sql.
-- AI decisions are committed only by the server's service_role connection.
BEGIN;
ALTER TABLE public.voice_lounge_members
  ADD COLUMN IF NOT EXISTS moderation_warnings integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS speaking_restricted_until timestamptz,
  ADD COLUMN IF NOT EXISTS restriction_reason text,
  ADD COLUMN IF NOT EXISTS last_warning_turn uuid,
  ADD COLUMN IF NOT EXISTS last_warning_at timestamptz,
  ADD COLUMN IF NOT EXISTS safety_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS voice_synced_at timestamptz;
ALTER TABLE public.voice_lounge_messages
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_verdict text,
  ADD COLUMN IF NOT EXISTS review_ticket uuid,
  ADD COLUMN IF NOT EXISTS review_ticket_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.voice_lounge_sessions
  ADD COLUMN IF NOT EXISTS reply_queue jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS reply_question text,
  ADD COLUMN IF NOT EXISTS reply_from uuid REFERENCES auth.users(id);
ALTER TABLE public.voice_lounge_sessions DROP CONSTRAINT IF EXISTS voice_lounge_sessions_turn_kind_check;
ALTER TABLE public.voice_lounge_sessions ADD CONSTRAINT voice_lounge_sessions_turn_kind_check CHECK(turn_kind IN ('basic','extra','reply'));
ALTER TABLE public.voice_lounge_session_turns ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS source_turn uuid REFERENCES public.voice_lounge_session_turns(id) ON DELETE SET NULL;

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
    stage_started_at=s.stage_started_at,turn_started_at=s.turn_started_at,spoken_seconds=s.spoken_seconds,
    activity_at=s.activity_at,nudged=s.nudged,between_since=s.between_since,updated_at=s.updated_at,
    reply_queue=s.reply_queue,reply_question=s.reply_question,reply_from=s.reply_from WHERE room_id=p_room;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.claim_voice_lounge_interaction(p_room text,p_actor uuid,p_message bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; m public.voice_lounge_messages; ticket uuid;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.status<>'active' OR r.expires_at<=now()
    OR NOT EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=p_actor AND active) THEN RETURN NULL; END IF;
  SELECT * INTO m FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='human'
    AND reviewed_at IS NULL AND review_attempts<3 AND created_at>now()-interval '2 minutes'
    AND (p_message IS NULL OR id=p_message)
    AND (user_id=p_actor OR (p_message IS NOT NULL AND r.host_id=p_actor))
    AND (review_ticket_at IS NULL OR review_ticket_at<now()-interval '30 seconds') ORDER BY id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  ticket:=gen_random_uuid();
  UPDATE public.voice_lounge_messages SET review_ticket=ticket,review_ticket_at=now(),review_attempts=review_attempts+1 WHERE id=m.id;
  RETURN jsonb_build_object('ticket',ticket,'message_id',m.id,'text',m.text,'speaker_id',m.user_id,'turn_id',m.turn_id,'topic',r.topic,
    'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',user_id,'nickname',nickname)),'[]') FROM public.voice_lounge_members
      WHERE room_id=p_room AND active AND last_seen>now()-interval '90 seconds'),
    'recent',(SELECT coalesce(jsonb_agg(row_to_json(x)),'[]') FROM (SELECT nickname,text FROM public.voice_lounge_messages
      WHERE room_id=p_room AND id<m.id AND kind='human' ORDER BY id DESC LIMIT 4) x));
END $$;

CREATE OR REPLACE FUNCTION public.finish_voice_lounge_interaction(p_room text,p_message bigint,p_ticket uuid,p_decision jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; m public.voice_lounge_messages; person public.voice_lounge_members;
  s public.voice_lounge_sessions; t public.voice_lounge_session_turns; target uuid; verdict text; reason text;
  counted boolean; queued boolean:=false; q jsonb;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.status<>'active' OR r.expires_at<=now() THEN RETURN jsonb_build_object('skipped',true); END IF;
  SELECT * INTO m FROM public.voice_lounge_messages WHERE id=p_message AND room_id=p_room FOR UPDATE;
  IF NOT FOUND OR m.reviewed_at IS NOT NULL OR m.review_ticket IS DISTINCT FROM p_ticket OR m.review_ticket_at<now()-interval '30 seconds'
    THEN RETURN jsonb_build_object('skipped',true); END IF;
  IF p_decision IS NULL OR jsonb_typeof(p_decision)<>'object' OR NOT(p_decision ?& ARRAY['moderation','reason'])
    OR p_decision->>'moderation' IS NULL OR p_decision->>'reason' IS NULL OR p_decision->>'moderation' NOT IN ('allow','warn','restrict')
    OR p_decision->>'reason' NOT IN ('none','harassment','hate','threat','sexual_harassment') THEN RAISE EXCEPTION 'invalid interaction decision'; END IF;
  verdict:=p_decision->>'moderation'; reason:=p_decision->>'reason';
  SELECT * INTO person FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=m.user_id FOR UPDATE;
  IF NOT FOUND OR NOT person.active THEN RETURN jsonb_build_object('skipped',true); END IF;
  IF verdict<>'allow' AND reason='none' THEN RAISE EXCEPTION 'invalid moderation reason'; END IF;
  IF verdict<>'allow' THEN
    -- One warning per original turn; segmentation or retries must not count twice.
    counted:=CASE WHEN m.turn_id IS NOT NULL THEN person.last_warning_turn IS DISTINCT FROM m.turn_id AND NOT EXISTS(
      SELECT 1 FROM public.voice_lounge_messages WHERE room_id=p_room AND user_id=m.user_id AND turn_id=m.turn_id
      AND reviewed_at IS NOT NULL AND moderation_verdict IN ('warn','restrict'))
      ELSE person.last_warning_at IS NULL OR person.last_warning_at<now()-interval '30 seconds' END;
    IF counted THEN person.moderation_warnings:=person.moderation_warnings+1; END IF;
    IF verdict='restrict' OR person.moderation_warnings>=2 THEN
      person.speaking_restricted_until:=greatest(coalesce(person.speaking_restricted_until,now()),now()+
        CASE WHEN verdict='restrict' THEN interval '5 minutes' ELSE interval '2 minutes' END);
    END IF;
    UPDATE public.voice_lounge_members SET moderation_warnings=person.moderation_warnings,last_warning_turn=m.turn_id,
      last_warning_at=CASE WHEN counted THEN now() ELSE last_warning_at END,
      speaking_restricted_until=person.speaking_restricted_until,restriction_reason=reason,safety_updated_at=clock_timestamp()
      WHERE room_id=p_room AND user_id=m.user_id;
    UPDATE public.voice_lounge_messages SET text='대화 보호를 위해 이 발언의 기록을 숨겼어요.' WHERE id=m.id;
    IF person.speaking_restricted_until>now() THEN
      SELECT * INTO s FROM public.voice_lounge_sessions WHERE room_id=p_room FOR UPDATE;
      IF FOUND AND s.speaker_id=m.user_id THEN
        UPDATE public.voice_lounge_session_turns SET ended_at=now() WHERE id=s.turn_id;
        UPDATE public.voice_lounge_sessions SET speaker_id=NULL,state='between',between_since=now(),
          completed=CASE WHEN s.turn_kind='basic' THEN array_append(s.completed,m.user_id) ELSE s.completed END,
          reply_question=NULL,reply_from=NULL,updated_at=clock_timestamp() WHERE room_id=p_room;
      END IF;
    END IF;
  ELSIF p_decision->>'target_id' IS NOT NULL AND r.guided_session AND m.turn_id IS NOT NULL THEN
    target:=(p_decision->>'target_id')::uuid;
    SELECT * INTO t FROM public.voice_lounge_session_turns WHERE id=m.turn_id AND room_id=p_room;
    SELECT * INTO s FROM public.voice_lounge_sessions WHERE room_id=p_room FOR UPDATE;
    IF FOUND AND t.speaker_id=m.user_id AND t.stage=s.stage AND t.kind<>'reply' AND t.started_at IS NOT NULL
      AND (t.ended_at IS NULL OR t.ended_at>now()-interval '90 seconds') AND target<>m.user_id
      AND length(trim(p_decision->>'question')) BETWEEN 2 AND 300 AND jsonb_array_length(s.reply_queue)<6
      AND EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=target AND active
        AND last_seen>now()-interval '90 seconds' AND (speaking_restricted_until IS NULL OR speaking_restricted_until<=now()))
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.reply_queue) e WHERE e->>'source_turn'=m.turn_id::text)
      AND NOT EXISTS(SELECT 1 FROM public.voice_lounge_session_turns WHERE room_id=p_room AND kind='reply' AND source_turn=m.turn_id) THEN
      q:=jsonb_build_object('target',target,'from',m.user_id,'source_turn',m.turn_id,'stage',s.stage,'question',trim(p_decision->>'question'));
      UPDATE public.voice_lounge_sessions SET reply_queue=reply_queue||jsonb_build_array(q),updated_at=clock_timestamp() WHERE room_id=p_room;
      queued:=true;
      -- A late transcript can precede an unannounced, unstarted basic turn.
      -- Do not consume that person's basic opportunity or interrupt a begun turn.
      IF t.ended_at IS NOT NULL AND s.state='ready' AND s.turn_kind<>'reply' AND s.announced_turn IS DISTINCT FROM s.turn_id THEN
        UPDATE public.voice_lounge_session_turns SET ended_at=now() WHERE id=s.turn_id;
        UPDATE public.voice_lounge_sessions SET speaker_id=target,turn_id=gen_random_uuid(),turn_kind='reply',
          reply_question=q->>'question',reply_from=m.user_id,reply_queue=s.reply_queue,
          hand_queue=CASE WHEN s.turn_kind='extra' THEN array_prepend(s.speaker_id,s.hand_queue) ELSE s.hand_queue END,turn_started_at=NULL,
          spoken_seconds=0,nudged=false,activity_at=NULL,updated_at=clock_timestamp() WHERE room_id=p_room RETURNING * INTO s;
        INSERT INTO public.voice_lounge_session_turns(id,room_id,speaker_id,stage,kind,source_turn) VALUES(s.turn_id,p_room,target,s.stage,'reply',m.turn_id);
      END IF;
    END IF;
  END IF;
  UPDATE public.voice_lounge_messages SET reviewed_at=now(),moderation_verdict=verdict,review_ticket=NULL,review_ticket_at=NULL WHERE id=m.id;
  RETURN jsonb_build_object('moderation',verdict,'warnings',person.moderation_warnings,'restricted_until',person.speaking_restricted_until,'question_queued',queued);
END $$;

CREATE OR REPLACE FUNCTION public.fail_voice_lounge_interaction(p_room text,p_message bigint,p_ticket uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE public.voice_lounge_messages SET review_ticket=NULL,review_ticket_at=now()-interval '20 seconds'
    WHERE room_id=p_room AND id=p_message AND review_ticket=p_ticket AND reviewed_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.release_voice_lounge_restriction(p_room text,p_actor uuid,p_target uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM 1 FROM public.voice_lounge_rooms WHERE id=p_room AND host_id=p_actor AND status<>'ended' FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=p_actor AND active) THEN RETURN false; END IF;
  UPDATE public.voice_lounge_members SET speaking_restricted_until=NULL,moderation_warnings=0,restriction_reason=NULL,
    last_warning_turn=NULL,last_warning_at=NULL,safety_updated_at=clock_timestamp() WHERE room_id=p_room AND user_id=p_target AND active;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.pending_voice_lounge_voice_sync(p_room text,p_actor uuid) RETURNS SETOF public.voice_lounge_members
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM 1 FROM public.voice_lounge_rooms WHERE id=p_room AND status<>'ended' FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=p_actor AND active) THEN RETURN; END IF;
  UPDATE public.voice_lounge_members SET speaking_restricted_until=NULL,safety_updated_at=clock_timestamp()
    WHERE room_id=p_room AND speaking_restricted_until<=now();
  RETURN QUERY SELECT * FROM public.voice_lounge_members WHERE room_id=p_room AND active AND safety_updated_at IS NOT NULL
    -- Recheck restricted participants after reconnects, including cached tokens.
    AND (speaking_restricted_until>now() OR voice_synced_at IS NULL OR voice_synced_at<safety_updated_at);
END $$;
CREATE OR REPLACE FUNCTION public.ack_voice_lounge_voice_sync(p_room text,p_user uuid,p_version timestamptz) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE public.voice_lounge_members SET voice_synced_at=p_version WHERE room_id=p_room AND user_id=p_user AND safety_updated_at=p_version;
$$;


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
END $$;

CREATE OR REPLACE FUNCTION public.claim_voice_lounge_audio(p_room text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.status<>'active' OR r.expires_at<=now() THEN RETURN false; END IF;
  UPDATE public.voice_lounge_members SET audio_requests=audio_requests+1,last_audio_at=now()
    WHERE room_id=p_room AND user_id=auth.uid() AND active AND audio_requests<240
    AND (speaking_restricted_until IS NULL OR speaking_restricted_until<=now())
    AND last_seen>now()-interval '45 seconds' AND (last_audio_at IS NULL OR last_audio_at<now()-interval '2 seconds');
  RETURN FOUND;
END $$;

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
    AND (speaking_restricted_until IS NULL OR speaking_restricted_until<=now())
    AND last_seen>now()-interval '45 seconds' AND (last_audio_at IS NULL OR last_audio_at<now()-interval '2 seconds');
  RETURN FOUND;
END $$;

-- AI audio currently shares the room owner's LiveKit participant. Avoid paying
-- for a broadcast that cannot be published while the owner is restricted.
CREATE OR REPLACE FUNCTION public.claim_voice_lounge_host(p_room text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.voice_lounge_sessions; ticket uuid;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.host_id IS DISTINCT FROM auth.uid() OR NOT public.is_voice_lounge_member(p_room)
    OR r.status<>'active' OR r.expires_at<=now() OR r.ai_turns>=120
    OR r.last_ai_at>now()-(CASE WHEN r.capacity=1 OR r.guided_session THEN interval '5 seconds' ELSE interval '30 seconds' END)
    OR r.ai_ticket_at>now()-interval '60 seconds'
    OR EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND speaking_restricted_until>now())
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

REVOKE ALL ON FUNCTION public.claim_voice_lounge_interaction(text,uuid,bigint),
  public.finish_voice_lounge_interaction(text,bigint,uuid,jsonb),public.fail_voice_lounge_interaction(text,bigint,uuid),
  public.release_voice_lounge_restriction(text,uuid,uuid),public.pending_voice_lounge_voice_sync(text,uuid),
  public.ack_voice_lounge_voice_sync(text,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_voice_lounge_interaction(text,uuid,bigint),
  public.finish_voice_lounge_interaction(text,bigint,uuid,jsonb),public.fail_voice_lounge_interaction(text,bigint,uuid),
  public.release_voice_lounge_restriction(text,uuid,uuid),public.pending_voice_lounge_voice_sync(text,uuid),
  public.ack_voice_lounge_voice_sync(text,uuid,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.control_voice_lounge_session(text,text,uuid,double precision),
  public.post_voice_lounge_message(text,text),public.claim_voice_lounge_audio(text),public.claim_voice_lounge_turn_audio(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.control_voice_lounge_session(text,text,uuid,double precision),
  public.post_voice_lounge_message(text,text),public.claim_voice_lounge_audio(text),public.claim_voice_lounge_turn_audio(text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
