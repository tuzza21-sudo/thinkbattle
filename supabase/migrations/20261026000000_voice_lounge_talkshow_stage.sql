-- Apply after 20261025000000_voice_lounge_postproduction_jazz_places.sql.
-- 백도하 (trickster) is now a stand-up comedian turned late-night talk show host, so his place is a talk show stage.
-- The id stays the same; only the display name changes.
BEGIN;
UPDATE public.voice_lounge_spaces SET name = '심야 토크쇼 무대' WHERE id = 'improv-theater';
NOTIFY pgrst,'reload schema';
COMMIT;
