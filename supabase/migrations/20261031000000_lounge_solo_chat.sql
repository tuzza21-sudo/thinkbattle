-- Apply after 20261030000000_lounge_beta_limits.sql.
-- One-to-one talks are a chat by default; the member turns the character's voice on when they want it.
--
-- voice_on (rooms of one only): while it is off, replies are text, the speech services are not used and the beta
-- allowance is not spent. Turning it on needs time left today; when the time runs out the voice turns off and the
-- conversation goes on as a chat instead of ending. A chat stays open while its page is open (each heartbeat keeps it
-- for another 30 minutes), as space tables already do. Rooms with other people are unchanged.
BEGIN;

ALTER TABLE public.voice_lounge_rooms ADD COLUMN IF NOT EXISTS voice_on boolean NOT NULL DEFAULT false;

-- Owner of a one-to-one room only. Returns the new state.
CREATE OR REPLACE FUNCTION public.set_voice_lounge_voice(p_room text,p_on boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; minutes integer;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.host_id<>auth.uid() OR r.capacity<>1 OR r.space_id IS NOT NULL OR r.status='ended' THEN
    RAISE EXCEPTION '1:1 대화에서만 음성을 켜고 끌 수 있어요.'; END IF;
  IF coalesce(p_on,false) AND public.lounge_beta_left(auth.uid(),'solo')<=0 THEN
    SELECT solo_daily_seconds/60 INTO minutes FROM public.lounge_beta_limits WHERE id=1;
    RAISE EXCEPTION '%', '베타 기간에는 캐릭터와의 음성 대화를 하루 '||minutes||'분까지 할 수 있어요. 오늘 음성 시간을 다 썼어요. 채팅으로는 계속 이야기할 수 있어요.';
  END IF;
  UPDATE public.voice_lounge_rooms SET voice_on=coalesce(p_on,false) WHERE id=p_room;
  RETURN coalesce(p_on,false);
END $$;
REVOKE ALL ON FUNCTION public.set_voice_lounge_voice(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_voice_lounge_voice(text,boolean) TO authenticated;

-- Same as 20261030000000 except for one-to-one rooms: taking the seat needs no time (a chat is free), only time with
-- the voice on counts, and running out turns the voice off instead of ending the room.
CREATE OR REPLACE FUNCTION public.voice_lounge_beta_meter() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; room_kind text; gap double precision; minutes integer;
BEGIN
  IF NOT NEW.active OR NOT public.lounge_beta_limited(NEW.user_id) THEN RETURN NEW; END IF;
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=NEW.room_id;
  IF NOT FOUND OR r.status='ended' THEN RETURN NEW; END IF;
  room_kind:=CASE WHEN r.capacity=1 THEN 'solo' ELSE 'group' END;

  -- Taking a seat in a shared room (a new one, or back to one left earlier) needs time left today.
  IF TG_OP='INSERT' OR NOT OLD.active THEN
    IF room_kind='group' AND public.lounge_beta_left(NEW.user_id,room_kind)<=0 THEN
      SELECT group_daily_seconds/60 INTO minutes FROM public.lounge_beta_limits WHERE id=1;
      RAISE EXCEPTION '%', '베타 기간에는 함께하는 대화방을 하루 '||minutes||'분까지 이용할 수 있어요. 오늘 시간을 다 썼어요. 내일 다시 만나요.';
    END IF;
    RETURN NEW;
  END IF;

  -- Staying: the time since the last sign of presence counts, unless the gap means they had gone.
  IF r.status<>'active' OR NEW.last_seen IS NOT DISTINCT FROM OLD.last_seen THEN RETURN NEW; END IF;
  IF room_kind='solo' AND NOT r.voice_on THEN RETURN NEW; END IF;
  gap:=extract(epoch FROM NEW.last_seen-OLD.last_seen);
  IF gap<=0 OR gap>90 THEN RETURN NEW; END IF;
  INSERT INTO public.lounge_daily_usage(user_id,day,kind,seconds) VALUES(NEW.user_id,public.lounge_today(),room_kind,gap)
    ON CONFLICT (user_id,day,kind) DO UPDATE SET seconds=public.lounge_daily_usage.seconds+excluded.seconds;
  IF public.lounge_beta_left(NEW.user_id,room_kind)<=0 THEN
    -- A 1:1 talk carries on as a chat; in a shared room only this member's seat goes.
    IF room_kind='solo' THEN UPDATE public.voice_lounge_rooms SET voice_on=false WHERE id=NEW.room_id;
    ELSE NEW.active:=false;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Same as 20261015000000 except that a one-to-one chat (voice off) is kept open like a space table.
CREATE OR REPLACE FUNCTION public.control_voice_lounge(p_room text,p_action text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR NOT public.is_voice_lounge_member(p_room) THEN RAISE EXCEPTION '방 참가 권한이 없어요.'; END IF;
  IF p_action='heartbeat' THEN
    UPDATE public.voice_lounge_members SET last_seen=now() WHERE room_id=p_room AND user_id=auth.uid();
    IF coalesce(r.expires_at,r.created_at+interval '2 hours')<=now()
      THEN UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room;
    ELSIF r.space_id IS NOT NULL AND r.status='active' THEN
      UPDATE public.voice_lounge_rooms SET expires_at=greatest(expires_at,now()+interval '30 minutes') WHERE id=p_room;
      PERFORM public.voice_lounge_pass_owner(p_room);
    ELSIF r.capacity=1 AND r.status='active' AND NOT r.voice_on THEN
      UPDATE public.voice_lounge_rooms SET expires_at=greatest(expires_at,now()+interval '30 minutes') WHERE id=p_room;
    END IF;
  ELSIF p_action='leave' THEN
    IF r.host_id=auth.uid() AND r.space_id IS NULL THEN UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room; END IF;
    UPDATE public.voice_lounge_members SET active=false WHERE room_id=p_room AND user_id=auth.uid();
    IF r.space_id IS NOT NULL THEN
      UPDATE public.voice_lounge_rooms SET broadcaster_id=NULL,broadcaster_seen_at=NULL WHERE id=p_room AND broadcaster_id=auth.uid();
      IF NOT EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND active) THEN
        UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room;
      ELSE
        PERFORM public.voice_lounge_pass_owner(p_room);
      END IF;
    END IF;
  ELSIF p_action='start' THEN
    IF r.host_id<>auth.uid() OR r.status<>'lobby' OR r.created_at+interval '2 hours'<=now() THEN RAISE EXCEPTION '방장만 유효한 대기방의 대화를 시작할 수 있어요.'; END IF;
    IF (SELECT count(*) FROM public.voice_lounge_members WHERE room_id=p_room AND active) < (CASE WHEN r.capacity=1 THEN 1 ELSE 2 END) THEN
      RAISE EXCEPTION '함께하는 방은 두 명 이상 모이면 시작할 수 있어요. 혼자 대화하려면 1:1 방을 만들어 주세요.';
    END IF;
    UPDATE public.voice_lounge_rooms SET status='active',started_at=now(),expires_at=now()+interval '1 hour' WHERE id=p_room;
  ELSIF p_action='end' THEN
    IF r.host_id<>auth.uid() OR r.space_id IS NOT NULL THEN RAISE EXCEPTION '방장만 종료할 수 있어요.'; END IF;
    UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room;
  ELSE RAISE EXCEPTION '올바르지 않은 요청이에요.';
  END IF;
END $$;

-- Same as 20261009000000 except that a reply may be up to 1200 characters (was 600): a chat reply carries a few
-- sentences together with the character's actions.
CREATE OR REPLACE FUNCTION public.finish_voice_lounge_host(p_room text,p_ticket uuid,p_text text,p_memory text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.voice_lounge_sessions; answered boolean;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR NOT public.voice_lounge_drives_ai(r,auth.uid()) OR r.ai_ticket IS DISTINCT FROM p_ticket
    OR r.status<>'active' OR r.expires_at<=now() OR r.ai_ticket_at<now()-interval '60 seconds' THEN RETURN false; END IF;
  IF r.guided_session THEN
    SELECT * INTO s FROM public.voice_lounge_sessions WHERE room_id=p_room FOR UPDATE;
    IF NOT FOUND OR s.turn_id IS DISTINCT FROM r.ai_session_turn OR s.state NOT IN ('ready','free') THEN
      UPDATE public.voice_lounge_rooms SET ai_ticket=NULL,ai_ticket_at=NULL,ai_host_reason=NULL WHERE id=p_room;
      RETURN false;
    END IF;
  END IF;
  IF length(trim(p_text)) NOT BETWEEN 1 AND 1200 THEN RAISE EXCEPTION 'invalid host response'; END IF;
  answered:=r.ai_host_reason='requested' AND r.moderator_requested_at<=r.ai_ticket_at;
  INSERT INTO public.voice_lounge_messages(room_id,nickname,kind,text) VALUES(p_room,'AI 사회자','host',trim(p_text));
  UPDATE public.voice_lounge_rooms SET memory=left(p_memory,1800),ai_ticket=NULL,ai_ticket_at=NULL,ai_host_reason=NULL,
    moderator_requested_at=CASE WHEN answered THEN NULL ELSE moderator_requested_at END,
    moderator_requested_by=CASE WHEN answered THEN NULL ELSE moderator_requested_by END,
    moderator_request_kind=CASE WHEN answered THEN NULL ELSE moderator_request_kind END WHERE id=p_room;
  IF r.guided_session AND r.ai_host_reason='opening' THEN
    UPDATE public.voice_lounge_sessions SET announced_turn=s.turn_id,announced_stage=s.stage,updated_at=clock_timestamp() WHERE room_id=p_room;
  END IF;
  RETURN true;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
