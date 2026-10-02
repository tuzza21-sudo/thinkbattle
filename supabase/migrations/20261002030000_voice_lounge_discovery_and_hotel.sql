-- Apply after the guided sessions migration. Only public room metadata is listed.
BEGIN;

ALTER TABLE public.voice_lounge_rooms DROP CONSTRAINT IF EXISTS voice_lounge_rooms_theme_check;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_rooms_theme_check
  CHECK (theme IN ('rooftop', 'river', 'forest', 'hotel'));

CREATE OR REPLACE FUNCTION public.create_voice_lounge(
  p_persona text, p_topic text, p_capacity integer, p_nickname text, p_theme text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE room_id text;
BEGIN
  IF p_theme IS NULL OR p_theme NOT IN ('rooftop', 'river', 'forest', 'hotel') THEN
    RAISE EXCEPTION '지원하지 않는 라운지 테마입니다.';
  END IF;
  room_id := public.create_voice_lounge(p_persona, p_topic, p_capacity, p_nickname);
  UPDATE public.voice_lounge_rooms SET theme = p_theme WHERE id = room_id AND host_id = auth.uid();
  RETURN room_id;
END;
$$;

-- Group rooms can be discovered before login. Solo rooms, ended/expired rooms
-- and rooms whose host has disconnected are omitted. Never return user IDs,
-- profiles, transcripts, memory, research notes or AI tickets.
CREATE OR REPLACE FUNCTION public.list_open_voice_lounges()
RETURNS TABLE(id text, topic text, host_persona text, theme text, capacity integer,
  status text, participant_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.topic, r.host_persona, r.theme, r.capacity, r.status,
    (SELECT count(*)::integer FROM public.voice_lounge_members m
      WHERE m.room_id = r.id AND m.active
      AND (m.user_id = r.host_id OR m.last_seen > now() - interval '2 minutes'))
  FROM public.voice_lounge_rooms r
  WHERE r.capacity > 1 AND r.status IN ('lobby', 'active')
    AND coalesce(r.expires_at, r.created_at + interval '2 hours') > now()
    AND EXISTS (SELECT 1 FROM public.voice_lounge_members h WHERE h.room_id = r.id
      AND h.user_id = r.host_id AND h.active AND h.last_seen > now() - interval '90 seconds')
  ORDER BY (r.status = 'lobby') DESC, r.created_at DESC, r.id
  LIMIT 60;
$$;

REVOKE ALL ON FUNCTION public.create_voice_lounge(text,text,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_voice_lounge(text,text,integer,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.list_open_voice_lounges() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_open_voice_lounges() TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
