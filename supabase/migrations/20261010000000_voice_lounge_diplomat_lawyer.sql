-- Apply after 20261009000000_voice_lounge_imagination_house_spaces.sql.
-- Two more characters: the diplomat (문서린) and the lawyer (차지훈), each hosting one always-open space with
-- its own scenery: the diplomatic reception lounge ('embassy') and the law library ('lawlibrary').
-- Relationship and memory tables take any character id of the usual shape, so only the host and theme lists change.
-- The seeded rows are inserted once; re-running this file does not overwrite later edits to them.
BEGIN;
ALTER TABLE public.voice_lounge_rooms DROP CONSTRAINT IF EXISTS voice_lounge_rooms_host_persona_check;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_rooms_host_persona_check CHECK (
  host_persona IN ('jaeseok','ina','auditor','closer','velvet','trickster','diplomat','lawyer'));
ALTER TABLE public.voice_lounge_rooms DROP CONSTRAINT IF EXISTS voice_lounge_rooms_theme_check;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_rooms_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotel','cafe','seaside','embassy','lawlibrary'));
ALTER TABLE public.voice_lounge_spaces DROP CONSTRAINT IF EXISTS voice_lounge_spaces_host_persona_check;
ALTER TABLE public.voice_lounge_spaces ADD CONSTRAINT voice_lounge_spaces_host_persona_check CHECK (
  host_persona IN ('jaeseok','ina','auditor','closer','velvet','trickster','diplomat','lawyer'));
ALTER TABLE public.voice_lounge_spaces DROP CONSTRAINT IF EXISTS voice_lounge_spaces_theme_check;
ALTER TABLE public.voice_lounge_spaces ADD CONSTRAINT voice_lounge_spaces_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotel','cafe','seaside','embassy','lawlibrary'));

-- Solo play opens a one-to-one room through this function with the space's scenery, so it must accept the new ones.
-- The longer research and guided-session entry points delegate to it.
CREATE OR REPLACE FUNCTION public.create_voice_lounge(
  p_persona text, p_topic text, p_capacity integer, p_nickname text, p_theme text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE room_id text;
BEGIN
  IF p_theme IS NULL OR p_theme NOT IN ('rooftop', 'river', 'forest', 'hotel', 'cafe', 'seaside', 'embassy', 'lawlibrary') THEN
    RAISE EXCEPTION '지원하지 않는 라운지 테마입니다.';
  END IF;
  room_id := public.create_voice_lounge(p_persona, p_topic, p_capacity, p_nickname);
  UPDATE public.voice_lounge_rooms SET theme = p_theme WHERE id = room_id AND host_id = auth.uid();
  RETURN room_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_voice_lounge(text,text,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_voice_lounge(text,text,integer,text,text) TO authenticated;

-- An earlier draft of this file seeded the same two characters as 'river-terrace' and 'night-law-lounge'. Where it
-- was already applied, each character would show two spaces. Remove those rows; one that already has tables (a table
-- row refers to it) cannot be deleted, so it is closed instead and no longer listed.
DELETE FROM public.voice_lounge_spaces s WHERE s.id IN ('river-terrace','night-law-lounge')
  AND NOT EXISTS (SELECT 1 FROM public.voice_lounge_rooms r WHERE r.space_id=s.id);
UPDATE public.voice_lounge_spaces SET open=false WHERE id IN ('river-terrace','night-law-lounge');

INSERT INTO public.voice_lounge_spaces(id,name,host_persona,theme,sort) VALUES
  ('embassy-reception','외교 리셉션 라운지','diplomat','embassy',7),
  ('law-library','법률 서재 라운지','lawyer','lawlibrary',8)
ON CONFLICT (id) DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
