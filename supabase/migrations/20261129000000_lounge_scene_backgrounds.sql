-- Apply after 20261128000000_lounge_memory_editing_and_personas.sql.
-- 2026-10-30: a story's background follows its scene.
-- - lounge_scene_backgrounds: backgrounds made for a scene (an episode of a story, or where a chat's scene has moved),
--   shared by every member. The server (service role) writes them when no place and no earlier scene fits, and keeps the
--   image in lounge-character-public under scenes/. scene_key names a story's episode so the next member in the same
--   episode gets the same picture without asking the model again; a scene matched by description has none.
-- - voice_lounge_rooms.background may now also be {blank:true} (an empty, neutral space) or {scene, image, prompt} (one
--   of the shared scenes), and records the story episode it was chosen in ({..., episode}) so a new episode can pick its
--   own. choose_lounge_room_background picks any of these; set_lounge_room_background stays for older pages.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lounge_scene_backgrounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_key text UNIQUE CHECK (scene_key IS NULL OR char_length(scene_key) BETWEEN 3 AND 120),
  description text NOT NULL CHECK (char_length(description) BETWEEN 4 AND 400),
  image_path text NOT NULL CHECK (image_path ~ '^scenes/[A-Za-z0-9._-]{1,120}\.(webp|jpg)$'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lounge_scene_backgrounds_recent ON public.lounge_scene_backgrounds (created_at DESC);
ALTER TABLE public.lounge_scene_backgrounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lounge_scene_backgrounds_read ON public.lounge_scene_backgrounds;
CREATE POLICY lounge_scene_backgrounds_read ON public.lounge_scene_backgrounds FOR SELECT USING (true);
REVOKE ALL ON public.lounge_scene_backgrounds FROM anon, authenticated;
GRANT SELECT ON public.lounge_scene_backgrounds TO anon, authenticated;

-- p_choice: {theme}, {blank:true}, {scene:<id>}, each with an optional episode (1-12); null goes back to the conversation's own.
CREATE OR REPLACE FUNCTION public.choose_lounge_room_background(p_room text, p_choice jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE picked jsonb; s public.lounge_scene_backgrounds; ep integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF p_choice IS NULL OR jsonb_typeof(p_choice) <> 'object' THEN
    picked := NULL;
  ELSIF p_choice ? 'theme' THEN
    IF p_choice->>'theme' NOT IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater') THEN
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
