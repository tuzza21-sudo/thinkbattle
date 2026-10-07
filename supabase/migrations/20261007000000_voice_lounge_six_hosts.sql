-- Apply after 20261006010000_voice_lounge_relationships.sql.
-- Six hosts remain. The bubbly (dodi) and lively (sunny) hosts are removed, and every remaining host
-- may be used in rooms of any size. Relationship state is still written only for one-to-one rooms
-- (save_voice_lounge_relationship requires capacity=1), so rooms with other people never change it.
BEGIN;
-- Existing rooms keep working: map each removed host to the closest remaining one.
UPDATE public.voice_lounge_rooms SET host_persona='jaeseok' WHERE host_persona='sunny';
UPDATE public.voice_lounge_rooms SET host_persona='ina' WHERE host_persona='dodi';
ALTER TABLE public.voice_lounge_rooms DROP CONSTRAINT IF EXISTS voice_lounge_rooms_host_persona_check;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_rooms_host_persona_check CHECK (
  host_persona IN ('jaeseok','ina','auditor','closer','velvet','trickster'));
NOTIFY pgrst,'reload schema';
COMMIT;
