-- Apply after 20261008010000_voice_lounge_memories.sql.
-- The few-shot style examples were removed (2026-10-07), and with them the per-room test switch.
-- Safe on a database that never had the switch.
BEGIN;
DROP FUNCTION IF EXISTS public.set_voice_lounge_style_examples(text, boolean);
ALTER TABLE public.voice_lounge_rooms DROP COLUMN IF EXISTS style_examples;
NOTIFY pgrst, 'reload schema';
COMMIT;
