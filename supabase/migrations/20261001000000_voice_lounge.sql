-- Isolated entertainment rooms. Existing debate/training tables are unchanged.
BEGIN;
CREATE TABLE public.voice_lounge_rooms (
  id text PRIMARY KEY DEFAULT ('lounge-' || gen_random_uuid()::text),
  host_id uuid NOT NULL REFERENCES auth.users(id),
  host_persona text NOT NULL CHECK (host_persona IN ('jaeseok','ina','sunny','dodi')),
  topic text NOT NULL CHECK (length(topic) BETWEEN 1 AND 160),
  capacity integer NOT NULL CHECK (capacity BETWEEN 2 AND 6),
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','active','ended')),
  created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, expires_at timestamptz,
  memory text NOT NULL DEFAULT '', ai_turns integer NOT NULL DEFAULT 0,
  last_ai_at timestamptz, ai_ticket uuid, ai_ticket_at timestamptz
);
CREATE TABLE public.voice_lounge_members (
  room_id text NOT NULL REFERENCES public.voice_lounge_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id), nickname text NOT NULL CHECK (length(nickname) BETWEEN 1 AND 30),
  active boolean NOT NULL DEFAULT true,
  last_seen timestamptz NOT NULL DEFAULT now(), joined_at timestamptz NOT NULL DEFAULT now(),
  audio_requests integer NOT NULL DEFAULT 0, last_audio_at timestamptz,
  PRIMARY KEY(room_id,user_id)
);
CREATE TABLE public.voice_lounge_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id text NOT NULL REFERENCES public.voice_lounge_rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id), nickname text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('human','host')), text text NOT NULL CHECK (length(text) BETWEEN 1 AND 1200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX voice_lounge_messages_room_idx ON public.voice_lounge_messages(room_id,id DESC);
CREATE INDEX voice_lounge_rooms_host_idx ON public.voice_lounge_rooms(host_id,created_at);
ALTER TABLE public.voice_lounge_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_lounge_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_lounge_messages ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.is_voice_lounge_member(p_room text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND active);
$$;
CREATE POLICY lounge_read ON public.voice_lounge_rooms FOR SELECT TO authenticated USING (public.is_voice_lounge_member(id));
CREATE POLICY lounge_members_read ON public.voice_lounge_members FOR SELECT TO authenticated USING (public.is_voice_lounge_member(room_id));
CREATE POLICY lounge_messages_read ON public.voice_lounge_messages FOR SELECT TO authenticated USING (public.is_voice_lounge_member(room_id));
REVOKE ALL ON public.voice_lounge_rooms,public.voice_lounge_members,public.voice_lounge_messages FROM anon,authenticated;
GRANT SELECT ON public.voice_lounge_rooms,public.voice_lounge_members,public.voice_lounge_messages TO authenticated;

CREATE FUNCTION public.create_voice_lounge(p_persona text,p_topic text,p_capacity integer,p_nickname text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE room_id text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  -- Serialize creations per user so the daily budget cannot be raced.
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 91));
  IF (SELECT count(*) FROM public.voice_lounge_rooms WHERE host_id=auth.uid() AND created_at > now()-interval '24 hours') >= 5 THEN
    RAISE EXCEPTION '테스트 기간에는 하루 5개까지 방을 만들 수 있어요.';
  END IF;
  INSERT INTO public.voice_lounge_rooms(host_id,host_persona,topic,capacity)
    VALUES(auth.uid(),p_persona,trim(p_topic),p_capacity) RETURNING id INTO room_id;
  INSERT INTO public.voice_lounge_members(room_id,user_id,nickname) VALUES(room_id,auth.uid(),left(trim(p_nickname),30));
  RETURN room_id;
END $$;

CREATE FUNCTION public.join_voice_lounge(p_room text,p_nickname text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.status='ended' OR coalesce(r.expires_at,r.created_at+interval '2 hours')<=now() THEN RAISE EXCEPTION '종료되었거나 존재하지 않는 방이에요.'; END IF;
  UPDATE public.voice_lounge_members SET active=false WHERE room_id=p_room AND user_id<>r.host_id AND last_seen<now()-interval '2 minutes';
  IF NOT public.is_voice_lounge_member(p_room) AND (SELECT count(*) FROM public.voice_lounge_members WHERE room_id=p_room AND active)>=r.capacity THEN
    RAISE EXCEPTION '방이 가득 찼어요.';
  END IF;
  INSERT INTO public.voice_lounge_members(room_id,user_id,nickname) VALUES(p_room,auth.uid(),left(trim(p_nickname),30))
    ON CONFLICT(room_id,user_id) DO UPDATE SET nickname=excluded.nickname,last_seen=now(),active=true;
END $$;

CREATE FUNCTION public.control_voice_lounge(p_room text,p_action text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR NOT public.is_voice_lounge_member(p_room) THEN RAISE EXCEPTION '방 참가 권한이 없어요.'; END IF;
  IF p_action='heartbeat' THEN
    UPDATE public.voice_lounge_members SET last_seen=now() WHERE room_id=p_room AND user_id=auth.uid();
    IF coalesce(r.expires_at,r.created_at+interval '2 hours')<=now()
      OR (r.status='active' AND NOT EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=r.host_id AND active AND last_seen>now()-interval '90 seconds'))
      THEN UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room; END IF;
  ELSIF p_action='leave' THEN
    IF r.host_id=auth.uid() THEN UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room; END IF;
    UPDATE public.voice_lounge_members SET active=false WHERE room_id=p_room AND user_id=auth.uid();
  ELSIF p_action='start' THEN
    IF r.host_id<>auth.uid() OR r.status<>'lobby' OR r.created_at+interval '2 hours'<=now() THEN RAISE EXCEPTION '방장만 유효한 대기방의 대화를 시작할 수 있어요.'; END IF;
    IF (SELECT count(*) FROM public.voice_lounge_members WHERE room_id=p_room AND active AND last_seen>now()-interval '45 seconds')<2 THEN RAISE EXCEPTION '두 명 이상 모이면 시작할 수 있어요.'; END IF;
    UPDATE public.voice_lounge_rooms SET status='active',started_at=now(),expires_at=now()+interval '1 hour' WHERE id=p_room;
  ELSIF p_action='end' THEN
    IF r.host_id<>auth.uid() THEN RAISE EXCEPTION '방장만 종료할 수 있어요.'; END IF;
    UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room;
  ELSE RAISE EXCEPTION '올바르지 않은 요청이에요.';
  END IF;
END $$;

CREATE FUNCTION public.post_voice_lounge_message(p_room text,p_text text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; n text;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.status<>'active' OR r.expires_at<=now() OR NOT public.is_voice_lounge_member(p_room) THEN RAISE EXCEPTION '진행 중인 방에서만 이야기할 수 있어요.'; END IF;
  IF length(trim(p_text)) NOT BETWEEN 1 AND 1200 THEN RAISE EXCEPTION '이야기는 1~1200자로 입력해 주세요.'; END IF;
  IF EXISTS(SELECT 1 FROM public.voice_lounge_messages WHERE room_id=p_room AND user_id=auth.uid() AND created_at>now()-interval '2 seconds') THEN RAISE EXCEPTION '조금만 천천히 이야기해 주세요.'; END IF;
  SELECT nickname INTO n FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid();
  INSERT INTO public.voice_lounge_messages(room_id,user_id,nickname,kind,text) VALUES(p_room,auth.uid(),n,'human',trim(p_text));
END $$;

-- Called before paid transcription: fixed ceilings, never supplied by a client.
CREATE FUNCTION public.claim_voice_lounge_audio(p_room text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.status<>'active' OR r.expires_at<=now() THEN RETURN false; END IF;
  UPDATE public.voice_lounge_members SET audio_requests=audio_requests+1,last_audio_at=now()
    WHERE room_id=p_room AND user_id=auth.uid() AND active AND audio_requests<240
    AND last_seen>now()-interval '45 seconds' AND (last_audio_at IS NULL OR last_audio_at<now()-interval '2 seconds');
  RETURN FOUND;
END $$;

-- One room-wide AI ticket, 30-second cooldown and 120-turn hard ceiling.
CREATE FUNCTION public.claim_voice_lounge_host(p_room text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; ticket uuid;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.host_id IS DISTINCT FROM auth.uid() OR NOT public.is_voice_lounge_member(p_room)
    OR r.status<>'active' OR r.expires_at<=now() OR r.ai_turns>=120
    OR r.last_ai_at>now()-interval '30 seconds' OR r.ai_ticket_at>now()-interval '60 seconds'
    OR (SELECT count(*) FROM public.voice_lounge_members WHERE room_id=p_room AND active AND last_seen>now()-interval '45 seconds')<2 THEN RETURN NULL; END IF;
  ticket:=gen_random_uuid();
  UPDATE public.voice_lounge_rooms SET ai_ticket=ticket,ai_ticket_at=now(),last_ai_at=now(),ai_turns=ai_turns+1 WHERE id=p_room;
  RETURN ticket;
END $$;

CREATE FUNCTION public.finish_voice_lounge_host(p_room text,p_ticket uuid,p_text text,p_memory text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.host_id IS DISTINCT FROM auth.uid() OR r.ai_ticket IS DISTINCT FROM p_ticket
    OR r.status<>'active' OR r.expires_at<=now() OR r.ai_ticket_at<now()-interval '60 seconds' THEN RETURN false; END IF;
  IF length(trim(p_text)) NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'invalid host response'; END IF;
  INSERT INTO public.voice_lounge_messages(room_id,nickname,kind,text) VALUES(p_room,'AI 사회자','host',trim(p_text));
  UPDATE public.voice_lounge_rooms SET memory=left(p_memory,1800),ai_ticket=NULL,ai_ticket_at=NULL WHERE id=p_room;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.is_voice_lounge_member(text),public.create_voice_lounge(text,text,integer,text),
  public.join_voice_lounge(text,text),public.control_voice_lounge(text,text),public.post_voice_lounge_message(text,text),
  public.claim_voice_lounge_audio(text),public.claim_voice_lounge_host(text),public.finish_voice_lounge_host(text,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_voice_lounge_member(text),public.create_voice_lounge(text,text,integer,text),
  public.join_voice_lounge(text,text),public.control_voice_lounge(text,text),public.post_voice_lounge_message(text,text),
  public.claim_voice_lounge_audio(text),public.claim_voice_lounge_host(text),public.finish_voice_lounge_host(text,uuid,text,text) TO authenticated;

-- Transcripts are ephemeral: delete ended rooms after 24h using a scheduled service-role job.
CREATE FUNCTION public.cleanup_voice_lounges() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE removed bigint;
BEGIN
  DELETE FROM public.voice_lounge_rooms WHERE coalesce(expires_at,created_at+interval '2 hours')<now()-interval '24 hours';
  GET DIAGNOSTICS removed=ROW_COUNT; RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.cleanup_voice_lounges() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_voice_lounges() TO service_role;
COMMIT;
