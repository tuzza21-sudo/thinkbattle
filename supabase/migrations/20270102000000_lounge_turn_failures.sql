-- A turn that gave no reply leaves a record (2026-11-19, by the owner): on 2026-11-19 three spoken messages in a call got no answer and
-- turn 186 left nothing behind, so no one could say whether a model refused or the request never reached one.
--   outcome 'skipped': the server would not start a turn (the claim was refused: the previous turn's 60-second ticket or a reply too soon).
--   outcome 'failed' : the turn started and ended without a saved reply; `attempts` lists every model tried, as in lounge_turn_models.
-- Written by the API with the server role; nobody else reads or writes it. A database without this table still works.

CREATE TABLE IF NOT EXISTS public.lounge_turn_failures(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  room_id text NOT NULL,
  character_id text,
  turn integer,
  medium text CHECK (medium IS NULL OR medium IN ('chat','voice')),
  stage integer,
  adult_mode boolean,
  adult_why text,
  adult_routed boolean,
  chosen_model text,
  client text CHECK (client IS NULL OR client IN ('app','web')),
  reason text,
  outcome text NOT NULL CHECK (outcome IN ('skipped','failed')),
  phase text,
  error_code text,
  error_status integer,
  upstream_status integer,
  error_message text,
  attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ms integer
);
CREATE INDEX IF NOT EXISTS lounge_turn_failures_created_idx ON public.lounge_turn_failures(created_at DESC);
CREATE INDEX IF NOT EXISTS lounge_turn_failures_room_idx ON public.lounge_turn_failures(room_id, created_at DESC);
ALTER TABLE public.lounge_turn_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_turn_failures FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.lounge_turn_failures TO service_role;

-- Which client asked (the store app or the web): the app's adult mode needs the member's confirmation, the web's does not, so this tells why adult mode was off in a turn.
ALTER TABLE public.lounge_turn_models ADD COLUMN IF NOT EXISTS client text CHECK (client IS NULL OR client IN ('app','web'));

-- Why adult mode was on or off in the turn: web, app_verified, app_not_verified (the member has not confirmed in the app), app_lookup_timeout / app_lookup_failed / app_lookup_http_<status> (the confirmation could not be read),
-- app_guest, killed / allowlisted / not_allowlisted (LOUNGE_ADULT_MODE), character_without_it, not_one_to_one.
ALTER TABLE public.lounge_turn_models ADD COLUMN IF NOT EXISTS adult_why text;
