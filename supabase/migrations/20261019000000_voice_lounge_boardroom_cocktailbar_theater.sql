-- Apply after 20261018000000_voice_lounge_solo_topic.sql.
-- Three new places with their own scenery: the executive boardroom (강무진), the upscale cocktail bar's bar seat
-- (선우령) and the improv theatre (백도하). They are ordinary places: anyone can open a room in them, and each is
-- also where its character's solo conversation takes place. The seeded rows are inserted once; re-running this file
-- does not overwrite later edits to them.
BEGIN;
ALTER TABLE public.voice_lounge_rooms DROP CONSTRAINT IF EXISTS voice_lounge_rooms_theme_check;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_rooms_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater'));
ALTER TABLE public.voice_lounge_spaces DROP CONSTRAINT IF EXISTS voice_lounge_spaces_theme_check;
ALTER TABLE public.voice_lounge_spaces ADD CONSTRAINT voice_lounge_spaces_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater'));

-- Solo play opens a one-to-one room with the place's scenery, so the function must accept the new ones.
CREATE OR REPLACE FUNCTION public.create_voice_lounge(
  p_persona text, p_topic text, p_capacity integer, p_nickname text, p_theme text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE room_id text;
BEGIN
  IF p_theme IS NULL OR p_theme NOT IN ('rooftop','river','forest','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater') THEN
    RAISE EXCEPTION '지원하지 않는 라운지 테마입니다.';
  END IF;
  room_id := public.create_voice_lounge(p_persona, p_topic, p_capacity, p_nickname);
  UPDATE public.voice_lounge_rooms SET theme = p_theme WHERE id = room_id AND host_id = auth.uid();
  RETURN room_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_voice_lounge(text,text,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_voice_lounge(text,text,integer,text,text) TO authenticated;

INSERT INTO public.voice_lounge_spaces(id,name,host_persona,theme,sort) VALUES
  ('executive-boardroom','중역 회의실','closer','boardroom',9),
  ('cocktail-bar','고급 칵테일바','velvet','cocktailbar',10),
  ('improv-theater','즉흥극 소극장','trickster','theater',11)
ON CONFLICT (id) DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
