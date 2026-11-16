-- Follows the existing 20261218 migration sequence. Apply before deploying 3,000-character companion replies.
BEGIN;
ALTER TABLE public.voice_lounge_messages DROP CONSTRAINT IF EXISTS voice_lounge_messages_text_check;
ALTER TABLE public.voice_lounge_messages ADD CONSTRAINT voice_lounge_messages_text_check
  CHECK(length(text)>=1 AND length(text)<=CASE WHEN kind='host' THEN 3000 ELSE 1200 END);

CREATE OR REPLACE FUNCTION public.finish_voice_lounge_reply(p_room text,p_ticket uuid,p_text text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.voice_lounge_sessions; answered boolean; reply_limit integer;
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
  reply_limit:=CASE WHEN r.capacity=1 AND r.space_id IS NULL AND NOT coalesce(r.voice_on,true) AND NOT r.guided_session THEN 3000 ELSE 1200 END;
  IF length(trim(p_text)) NOT BETWEEN 1 AND reply_limit THEN RAISE EXCEPTION 'invalid host response'; END IF;
  answered:=r.ai_host_reason='requested' AND r.moderator_requested_at<=r.ai_ticket_at;
  INSERT INTO public.voice_lounge_messages(room_id,nickname,kind,text) VALUES(p_room,'AI 사회자','host',trim(p_text));
  UPDATE public.voice_lounge_rooms SET ai_ticket=NULL,ai_ticket_at=NULL,ai_host_reason=NULL,
    moderator_requested_at=CASE WHEN answered THEN NULL ELSE moderator_requested_at END,
    moderator_requested_by=CASE WHEN answered THEN NULL ELSE moderator_requested_by END,
    moderator_request_kind=CASE WHEN answered THEN NULL ELSE moderator_request_kind END WHERE id=p_room;
  IF r.guided_session AND r.ai_host_reason='opening' THEN
    UPDATE public.voice_lounge_sessions SET announced_turn=s.turn_id,announced_stage=s.stage,updated_at=clock_timestamp() WHERE room_id=p_room;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_voice_lounge_reply(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finish_voice_lounge_reply(text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finish_voice_lounge_host(p_room text,p_ticket uuid,p_text text,p_memory text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.voice_lounge_sessions; answered boolean; reply_limit integer;
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
  reply_limit:=CASE WHEN r.capacity=1 AND r.space_id IS NULL AND NOT coalesce(r.voice_on,true) AND NOT r.guided_session THEN 3000 ELSE 1200 END;
  IF length(trim(p_text)) NOT BETWEEN 1 AND reply_limit THEN RAISE EXCEPTION 'invalid host response'; END IF;
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
REVOKE ALL ON FUNCTION public.finish_voice_lounge_host(text,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finish_voice_lounge_host(text,uuid,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
