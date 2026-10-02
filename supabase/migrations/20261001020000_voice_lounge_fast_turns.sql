-- Solo hosts respond to each completed human turn. Keep group pacing and budgets.
BEGIN;
CREATE OR REPLACE FUNCTION public.claim_voice_lounge_host(p_room text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; ticket uuid;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.host_id IS DISTINCT FROM auth.uid() OR NOT public.is_voice_lounge_member(p_room)
    OR r.status<>'active' OR r.expires_at<=now() OR r.ai_turns>=120
    OR r.last_ai_at>now()-(CASE WHEN r.capacity=1 THEN interval '2 seconds' ELSE interval '30 seconds' END)
    OR r.ai_ticket_at>now()-interval '60 seconds'
    OR (SELECT count(*) FROM public.voice_lounge_members WHERE room_id=p_room AND active AND last_seen>now()-interval '45 seconds') < (CASE WHEN r.capacity=1 THEN 1 ELSE 2 END) THEN RETURN NULL; END IF;
  ticket:=gen_random_uuid();
  UPDATE public.voice_lounge_rooms SET ai_ticket=ticket,ai_ticket_at=now(),last_ai_at=now(),ai_turns=ai_turns+1 WHERE id=p_room;
  RETURN ticket;
END $$;
REVOKE ALL ON FUNCTION public.claim_voice_lounge_host(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_voice_lounge_host(text) TO authenticated;
COMMIT;
