-- (2026-11-07) A new place, the Arno bridge in Florence (arnobridge, '아르노강 다리'): 한지오's place and the background his story
-- opens on (the prologue is the first day at the Florence airport, and he promises the Arno at sunset). It joins the places
-- a room, a space, a story and a member's character may have (the theme lists in the CHECK constraints) and the places the
-- functions that create a room or choose a background accept. The functions are rewritten from their present text, so a
-- later change to any of them is kept: every function whose body lists the places gets the new one added to that list.
-- Rooms already started keep their background. Apply after 20261211010000_lounge_guide_florence_prologue.sql (or before it:
-- they do not depend on each other).
BEGIN;

DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
    WHERE contype='c' AND conrelid IN ('public.voice_lounge_rooms'::regclass,'public.voice_lounge_spaces'::regclass,
      'public.lounge_scenarios'::regclass,'public.lounge_custom_characters'::regclass)
      AND pg_get_constraintdef(oid) LIKE '%theme%' AND pg_get_constraintdef(oid) LIKE '%rooftop%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_rooms_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge'));
ALTER TABLE public.voice_lounge_spaces ADD CONSTRAINT voice_lounge_spaces_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge'));
ALTER TABLE public.lounge_scenarios ADD CONSTRAINT lounge_scenarios_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge'));
ALTER TABLE public.lounge_custom_characters ADD CONSTRAINT lounge_custom_characters_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge'));

DO $$
DECLARE f record; def text; fixed integer := 0; already integer := 0;
BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f' LOOP
    def := pg_get_functiondef(f.oid);
    IF position('''cocktailbar'',''theater''' IN def) > 0 AND position('arnobridge' IN def) = 0 THEN
      EXECUTE replace(def, '''cocktailbar'',''theater''', '''cocktailbar'',''theater'',''arnobridge''');
      fixed := fixed + 1;
    ELSIF position('arnobridge' IN def) > 0 THEN
      already := already + 1;
    END IF;
  END LOOP;
  IF fixed + already = 0 THEN RAISE EXCEPTION 'no function lists the places: nothing to add the Arno bridge to'; END IF;
  RAISE NOTICE 'the Arno bridge added to % functions', fixed;
END $$;

-- 한지오's story opens on the Arno bridge. (The id guide-enrosadira: 한지오's one story.)
UPDATE public.lounge_scenarios SET theme = 'arnobridge', updated_at = now() WHERE id = 'guide-enrosadira';

COMMIT;
