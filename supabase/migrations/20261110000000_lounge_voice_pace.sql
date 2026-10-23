-- Apply after 20261109000000_lounge_scenarios_bonds.sql.
-- A one-to-one voice conversation answers sooner. The five seconds kept between two AI turns in a one-to-one voice room
-- held the next answer back whenever a reply was short; it is two seconds now. In its place, as in a chat, a voice
-- follow-up is only claimed while something the member said is still unanswered, so the page answering at once (as
-- soon as the words are written down) and the room check that follows never give two answers to one thing said.
BEGIN;

-- Same as 20261106000000 except for the two one-to-one rules above.
CREATE OR REPLACE FUNCTION public.claim_voice_lounge_host(p_room text,p_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.voice_lounge_sessions; ticket uuid; live_count integer; last_host bigint; solo boolean; chat boolean;
BEGIN
  IF p_reason IS NULL OR p_reason NOT IN ('opening','followup','silence','requested') THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  SELECT count(*) INTO live_count FROM public.voice_lounge_members WHERE room_id=p_room AND active;
  solo:=coalesce(public.voice_lounge_is_solo(r),false);
  chat:=r.capacity=1 AND r.space_id IS NULL AND NOT coalesce(r.voice_on,true);
  IF r.id IS NULL OR NOT public.voice_lounge_drives_ai(r,auth.uid()) OR NOT public.is_voice_lounge_member(p_room)
    OR r.status<>'active' OR r.expires_at<=now() OR r.ai_turns>=120
    OR r.last_ai_at>now()-(CASE WHEN chat THEN interval '1 second' WHEN solo THEN interval '2 seconds' ELSE interval '10 seconds' END)
    OR r.ai_ticket_at>now()-interval '60 seconds'
    OR EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND speaking_restricted_until>now())
    OR live_count<1 THEN RETURN NULL; END IF;
  IF p_reason='followup' AND NOT solo THEN RETURN NULL; END IF;
  IF p_reason='followup' AND solo THEN
    SELECT max(id) INTO last_host FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='host';
    IF NOT EXISTS(SELECT 1 FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='human' AND id>coalesce(last_host,0)) THEN RETURN NULL; END IF;
  END IF;
  IF p_reason='requested' AND NOT solo AND r.moderator_requested_at IS NULL THEN RETURN NULL; END IF;
  IF p_reason='silence' THEN
    -- Never twice into the same silence: people must have spoken since the AI last did.
    IF solo OR r.last_ai_at>now()-interval '120 seconds' THEN RETURN NULL; END IF;
    SELECT max(id) INTO last_host FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='host';
    IF NOT EXISTS(SELECT 1 FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='human' AND id>coalesce(last_host,0))
      OR EXISTS(SELECT 1 FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='human' AND created_at>now()-interval '30 seconds') THEN RETURN NULL; END IF;
  END IF;
  IF r.guided_session THEN
    SELECT * INTO s FROM public.voice_lounge_sessions WHERE room_id=p_room;
    IF NOT FOUND OR s.state NOT IN ('ready','free') THEN RETURN NULL; END IF;
    IF p_reason='opening' AND (s.stage NOT IN (0,1,5) OR s.announced_stage=s.stage) THEN RETURN NULL; END IF;
    IF p_reason='silence' AND s.state<>'free' THEN RETURN NULL; END IF;
  ELSIF NOT solo AND p_reason='opening' AND EXISTS(
    SELECT 1 FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='host') THEN RETURN NULL;
  END IF;
  ticket:=gen_random_uuid();
  UPDATE public.voice_lounge_rooms SET ai_ticket=ticket,ai_ticket_at=now(),last_ai_at=now(),ai_turns=ai_turns+1,
    ai_session_turn=CASE WHEN r.guided_session THEN s.turn_id ELSE NULL END,ai_host_reason=p_reason WHERE id=p_room;
  RETURN ticket;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
