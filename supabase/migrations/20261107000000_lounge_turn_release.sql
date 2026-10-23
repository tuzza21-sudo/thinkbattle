-- Apply after 20261106000000_lounge_chat_pace.sql.
-- A turn whose reply failed (the model timed out, the page was closed or reloaded) gives its claim back at once.
-- Until now the claim stayed for 60 seconds, and the room answered nothing in that time: after one failed reply the
-- conversation looked frozen for up to a minute (2026-10-22).
BEGIN;

-- Only the browser that claimed the turn, and only for that claim; a claim already finished or replaced is left alone.
CREATE OR REPLACE FUNCTION public.release_voice_lounge_host(p_room text,p_ticket uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR p_ticket IS NULL OR r.ai_ticket IS DISTINCT FROM p_ticket OR NOT public.voice_lounge_drives_ai(r,auth.uid()) THEN RETURN; END IF;
  UPDATE public.voice_lounge_rooms SET ai_ticket=NULL,ai_ticket_at=NULL,ai_host_reason=NULL WHERE id=p_room;
END $$;
REVOKE ALL ON FUNCTION public.release_voice_lounge_host(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.release_voice_lounge_host(text,uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
