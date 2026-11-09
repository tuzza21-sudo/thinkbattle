-- Apply in the Supabase SQL editor (migrations are not applied on merge).
-- (2026-11-09) The shared background library: every background that is made is named and tagged, so the library can be searched and a
-- background is reused instead of a new one made (api/lounge-images.ts).
--  * name: a short Korean name ("비 오는 밤 자동차 안"); shown in the background picker.
--  * tags: keywords (kind of place, indoor or outdoor, time of day, mood, things in it); the server narrows the library with them.
--  * bump_lounge_scene_use: one more use when a conversation takes a background from the library (the most used come first).
-- Without this the server still works: it reads and writes the library without names and tags.
BEGIN;

ALTER TABLE public.lounge_scene_backgrounds ADD COLUMN IF NOT EXISTS name text CHECK (name IS NULL OR char_length(name) BETWEEN 1 AND 40);
ALTER TABLE public.lounge_scene_backgrounds ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS lounge_scene_backgrounds_tags ON public.lounge_scene_backgrounds USING GIN (tags);

CREATE OR REPLACE FUNCTION public.bump_lounge_scene_use(p_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE public.lounge_scene_backgrounds SET uses = uses + 1 WHERE id = p_id;
$$;
REVOKE ALL ON FUNCTION public.bump_lounge_scene_use(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_lounge_scene_use(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
