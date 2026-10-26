-- Apply after 20261115000000_lounge_gentle_groom_and_director_ex.sql.
-- 2026-10-26:
-- - A new place, 호텔 로비 카페 (hotellobby). 서도현's first meeting (auditor-vip-match) takes place there.
-- - A member changes the background of their own one-to-one conversation as the story moves (rooms.background): one
--   of the places, or an image made from their own description (written by /api/lounge-images with the service key,
--   kept under the member's folder in lounge-character-private).
-- - A character a member creates may open with a prologue (sheet.prologue, with sheet.userRole and
--   sheet.storyRelationship): its first conversation then starts as a story, like the house characters' stories.
BEGIN;

-- Every table that names a place accepts the new one. The checks were written inline, so they are found by table.
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
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater'));
ALTER TABLE public.voice_lounge_spaces ADD CONSTRAINT voice_lounge_spaces_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater'));
ALTER TABLE public.lounge_scenarios ADD CONSTRAINT lounge_scenarios_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater'));
ALTER TABLE public.lounge_custom_characters ADD CONSTRAINT lounge_custom_characters_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater'));

CREATE OR REPLACE FUNCTION public.create_voice_lounge(
  p_persona text, p_topic text, p_capacity integer, p_nickname text, p_theme text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE room_id text;
BEGIN
  IF p_theme IS NULL OR p_theme NOT IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater') THEN
    RAISE EXCEPTION '지원하지 않는 라운지 테마입니다.';
  END IF;
  room_id := public.create_voice_lounge(p_persona, p_topic, p_capacity, p_nickname);
  UPDATE public.voice_lounge_rooms SET theme = p_theme WHERE id = room_id AND host_id = auth.uid();
  RETURN room_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_voice_lounge(text,text,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_voice_lounge(text,text,integer,text,text) TO authenticated;

UPDATE public.lounge_scenarios SET theme='hotellobby', updated_at=now() WHERE id='auditor-vip-match';
UPDATE public.voice_lounge_rooms SET theme='hotellobby' WHERE scenario->>'id'='auditor-vip-match';

-- The background a member chose for their one-to-one conversation.
ALTER TABLE public.voice_lounge_rooms ADD COLUMN IF NOT EXISTS background jsonb
  CHECK (background IS NULL OR jsonb_typeof(background)='object');

-- Picks one of the places (or, with null, goes back to the conversation's own). An image made from a description is
-- saved by the server.
CREATE OR REPLACE FUNCTION public.set_lounge_room_background(p_room text, p_theme text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF p_theme IS NOT NULL AND p_theme NOT IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater') THEN
    RAISE EXCEPTION '지원하지 않는 배경이에요.';
  END IF;
  UPDATE public.voice_lounge_rooms SET background = CASE WHEN p_theme IS NULL THEN NULL ELSE jsonb_build_object('theme', p_theme) END
    WHERE id=p_room AND host_id=auth.uid() AND capacity=1 AND space_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION '내 1:1 대화에서만 배경을 바꿀 수 있어요.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_lounge_room_background(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lounge_room_background(text,text) TO authenticated;

-- A member's character with a prologue starts its first conversation as a story.
CREATE OR REPLACE FUNCTION public.start_lounge_custom_chat(p_character text, p_nickname text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.lounge_custom_characters; picked text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT * INTO c FROM public.lounge_custom_characters WHERE id=p_character;
  IF NOT FOUND OR NOT (c.owner_id=auth.uid() OR c.status='public') THEN RAISE EXCEPTION '대화할 수 없는 캐릭터예요.'; END IF;
  IF c.portrait_path IS NULL THEN RAISE EXCEPTION '대표 사진을 정한 뒤 대화할 수 있어요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
  SELECT id INTO picked FROM public.voice_lounge_rooms
    WHERE host_id=auth.uid() AND capacity=1 AND space_id IS NULL AND host_persona=p_character
    ORDER BY created_at DESC LIMIT 1;
  IF picked IS NOT NULL THEN RETURN public.resume_lounge_chat(picked); END IF;
  picked := public.create_voice_lounge(p_character,'둘이서 편하게 이야기해요',1,p_nickname,c.theme);
  IF length(btrim(coalesce(c.sheet->>'prologue',''))) >= 20 THEN
    UPDATE public.voice_lounge_rooms SET scenario=jsonb_build_object('id','custom-story','title',left(c.name||'와(과)의 이야기',40),
      'prologue',left(btrim(c.sheet->>'prologue'),3000),'user_role',left(btrim(coalesce(c.sheet->>'userRole','')),120),
      'relationship',left(btrim(coalesce(c.sheet->>'storyRelationship','')),200),'place','')
      WHERE id=picked AND host_id=auth.uid();
  END IF;
  RETURN picked;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
