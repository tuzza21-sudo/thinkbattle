BEGIN;

ALTER TABLE public.voice_lounge_rooms
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'rooftop';
ALTER TABLE public.voice_lounge_rooms
  DROP CONSTRAINT IF EXISTS voice_lounge_rooms_theme_check;
ALTER TABLE public.voice_lounge_rooms
  ADD CONSTRAINT voice_lounge_rooms_theme_check CHECK (theme IN ('rooftop', 'river', 'forest'));

-- Keep the original four-argument entry point for older clients and reuse
-- its authentication, room limits and membership creation atomically.
CREATE OR REPLACE FUNCTION public.create_voice_lounge(
  p_persona text, p_topic text, p_capacity integer, p_nickname text, p_theme text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE room_id text;
BEGIN
  IF p_theme IS NULL OR p_theme NOT IN ('rooftop', 'river', 'forest') THEN
    RAISE EXCEPTION '지원하지 않는 라운지 테마입니다.';
  END IF;
  room_id := public.create_voice_lounge(p_persona, p_topic, p_capacity, p_nickname);
  UPDATE public.voice_lounge_rooms SET theme = p_theme WHERE id = room_id AND host_id = auth.uid();
  RETURN room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_voice_lounge(text, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_voice_lounge(text, text, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_voice_lounge(text, text, integer, text, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
