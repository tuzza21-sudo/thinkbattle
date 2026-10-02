-- Remove the per-user room creation ceiling for both creation entry points.
-- The five-argument themed entry point delegates to this function.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_voice_lounge(
  p_persona text, p_topic text, p_capacity integer, p_nickname text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE room_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  INSERT INTO public.voice_lounge_rooms(host_id, host_persona, topic, capacity)
    VALUES(auth.uid(), p_persona, trim(p_topic), p_capacity)
    RETURNING id INTO room_id;
  INSERT INTO public.voice_lounge_members(room_id, user_id, nickname)
    VALUES(room_id, auth.uid(), left(trim(p_nickname), 30));
  RETURN room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_voice_lounge(text, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_voice_lounge(text, text, integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
