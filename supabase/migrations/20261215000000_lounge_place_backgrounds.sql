-- Apply in the Supabase SQL editor (migrations are not applied on merge).
-- (2026-11-09) Five backgrounds that are places only (car, living room, bedroom, restaurant, street), and the member's own
-- choice of them. The automatic follow of the scene (api/lounge-images.ts) writes the background through the server and
-- needs nothing here; this is for the member picking one by hand in the background picker.
-- choose_lounge_room_background listed twelve places, which also left out 'arnobridge' (added 2026-11-07), so picking that
-- one by hand failed too; the list is now all places.
-- Rooms, spaces and scenarios are not made with the five (their own lists of places stay as they are).
BEGIN;

CREATE OR REPLACE FUNCTION public.choose_lounge_room_background(p_room text, p_choice jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE picked jsonb; s public.lounge_scene_backgrounds; ep integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF p_choice IS NULL OR jsonb_typeof(p_choice) <> 'object' THEN
    picked := NULL;
  ELSIF p_choice ? 'theme' THEN
    IF p_choice->>'theme' NOT IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge','car','livingroom','bedroom','restaurant','street') THEN
      RAISE EXCEPTION '지원하지 않는 배경이에요.';
    END IF;
    picked := jsonb_build_object('theme', p_choice->>'theme');
  ELSIF p_choice->>'blank' = 'true' THEN
    picked := jsonb_build_object('blank', true);
  ELSIF p_choice ? 'scene' THEN
    SELECT * INTO s FROM public.lounge_scene_backgrounds WHERE id::text = p_choice->>'scene';
    IF NOT FOUND THEN RAISE EXCEPTION '찾을 수 없는 배경이에요.'; END IF;
    picked := jsonb_build_object('scene', s.id, 'image', s.image_path, 'prompt', s.description);
    UPDATE public.lounge_scene_backgrounds SET uses = uses + 1 WHERE id = s.id;
  ELSE
    RAISE EXCEPTION '올바르지 않은 배경이에요.';
  END IF;
  IF picked IS NOT NULL AND jsonb_typeof(p_choice->'episode') = 'number' THEN
    ep := (p_choice->>'episode')::numeric::integer;
    IF ep BETWEEN 1 AND 12 THEN picked := picked || jsonb_build_object('episode', ep); END IF;
  END IF;
  UPDATE public.voice_lounge_rooms SET background = picked
    WHERE id=p_room AND host_id=auth.uid() AND capacity=1 AND space_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION '내 1:1 대화에서만 배경을 바꿀 수 있어요.'; END IF;
  RETURN picked;
END $$;
REVOKE ALL ON FUNCTION public.choose_lounge_room_background(text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.choose_lounge_room_background(text,jsonb) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
