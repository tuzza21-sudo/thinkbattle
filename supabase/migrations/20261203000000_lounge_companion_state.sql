-- Apply after 20261202000000_lounge_diplomat_prologue_shorter.sql (it needs nothing else).
-- (2026-11-02) Engine v4 of the one-to-one chat: the two are together in one place, and the server keeps, per member and
-- character, where they are and what the last turns used, so the next reply neither contradicts the scene nor repeats
-- itself (see src/lib/loungeMessenger.ts, LoungeCompanionState):
--   - the scene (place, kind of place, what the two are doing, time, season, the things there) and its turns there;
--   - the events that happened around the two and when (one that does not repeat happens once with this member);
--   - the reaction kinds, phrases, actions and inner voices of the last replies, to be avoided;
--   - when the contrast of how people usually treat the character and this member was last said;
--   - what the two did together and what the character said about itself.
-- Everything but the used events belongs to one room and starts again with a new one (처음부터 하기). Written and read
-- only with the server key. Without this table the chat works as before, from the summary's scene line.
BEGIN;

CREATE TABLE IF NOT EXISTS public.voice_lounge_companion_state(
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id text NOT NULL CHECK (length(character_id) BETWEEN 1 AND 60),
  state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(state) = 'object' AND pg_column_size(state) <= 32768),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, character_id)
);
ALTER TABLE public.voice_lounge_companion_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.voice_lounge_companion_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.voice_lounge_companion_state TO service_role;

COMMIT;
