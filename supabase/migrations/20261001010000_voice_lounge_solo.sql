-- Support one human with the AI host, while group rooms still need two humans.
BEGIN;
ALTER TABLE public.voice_lounge_rooms DROP CONSTRAINT voice_lounge_rooms_capacity_check;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_rooms_capacity_check CHECK (capacity BETWEEN 1 AND 6);

CREATE OR REPLACE FUNCTION public.control_voice_lounge(p_room text,p_action text) RETURNS void
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
    IF (SELECT count(*) FROM public.voice_lounge_members WHERE room_id=p_room AND active AND last_seen>now()-interval '45 seconds') < (CASE WHEN r.capacity=1 THEN 1 ELSE 2 END) THEN
      RAISE EXCEPTION '함께하는 방은 두 명 이상 모이면 시작할 수 있어요. 혼자 대화하려면 1:1 방을 만들어 주세요.';
    END IF;
    UPDATE public.voice_lounge_rooms SET status='active',started_at=now(),expires_at=now()+interval '1 hour' WHERE id=p_room;
  ELSIF p_action='end' THEN
    IF r.host_id<>auth.uid() THEN RAISE EXCEPTION '방장만 종료할 수 있어요.'; END IF;
    UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room;
  ELSE RAISE EXCEPTION '올바르지 않은 요청이에요.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.claim_voice_lounge_host(p_room text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; ticket uuid;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.host_id IS DISTINCT FROM auth.uid() OR NOT public.is_voice_lounge_member(p_room)
    OR r.status<>'active' OR r.expires_at<=now() OR r.ai_turns>=120
    OR r.last_ai_at>now()-interval '30 seconds' OR r.ai_ticket_at>now()-interval '60 seconds'
    OR (SELECT count(*) FROM public.voice_lounge_members WHERE room_id=p_room AND active AND last_seen>now()-interval '45 seconds') < (CASE WHEN r.capacity=1 THEN 1 ELSE 2 END) THEN RETURN NULL; END IF;
  ticket:=gen_random_uuid();
  UPDATE public.voice_lounge_rooms SET ai_ticket=ticket,ai_ticket_at=now(),last_ai_at=now(),ai_turns=ai_turns+1 WHERE id=p_room;
  RETURN ticket;
END $$;

-- CREATE OR REPLACE retains privileges; repeat explicitly for clean installations.
REVOKE ALL ON FUNCTION public.control_voice_lounge(text,text),public.claim_voice_lounge_host(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.control_voice_lounge(text,text),public.claim_voice_lounge_host(text) TO authenticated;
COMMIT;
