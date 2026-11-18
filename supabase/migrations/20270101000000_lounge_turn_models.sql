-- Each reply turn's model record (2026-11-18, by the owner): the model chosen in the room, the reading of the scene, the model
-- that was applied, and every attempt (provider, model, ok, ms, status), so that the adult model's (NanoGPT) failures can be counted.
-- Written by the API with the server role; nobody else reads or writes it. A database without this table still works: the API
-- ignores the missing table.

CREATE TABLE IF NOT EXISTS public.lounge_turn_models(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  room_id text NOT NULL,
  character_id text NOT NULL,
  turn integer,
  medium text NOT NULL DEFAULT 'chat' CHECK (medium IN ('chat','voice')),
  stage integer,
  adult_mode boolean NOT NULL DEFAULT false,
  chosen_model text,
  sexual boolean,
  adult_routed boolean NOT NULL DEFAULT false,
  applied_provider text,
  applied_model text,
  fallback boolean NOT NULL DEFAULT false,
  attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
  chars integer
);
CREATE INDEX IF NOT EXISTS lounge_turn_models_created_idx ON public.lounge_turn_models(created_at DESC);
CREATE INDEX IF NOT EXISTS lounge_turn_models_room_idx ON public.lounge_turn_models(room_id, created_at DESC);
ALTER TABLE public.lounge_turn_models ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_turn_models FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.lounge_turn_models TO service_role;

-- How often the adult model answered or failed, by hour (Korea time): select * from lounge_nanogpt_stability order by hour desc;
CREATE OR REPLACE VIEW public.lounge_nanogpt_stability AS
SELECT date_trunc('hour', t.created_at AT TIME ZONE 'Asia/Seoul') AS hour,
  count(*) AS adult_routed_turns,
  count(*) FILTER (WHERE t.applied_provider = 'nanogpt') AS answered_by_nanogpt,
  count(*) FILTER (WHERE a.failed > 0) AS turns_with_a_nanogpt_failure,
  count(*) FILTER (WHERE t.applied_provider IS DISTINCT FROM 'nanogpt') AS answered_by_other,
  sum(a.failed) AS nanogpt_failed_attempts
FROM public.lounge_turn_models t
CROSS JOIN LATERAL (SELECT count(*) FILTER (WHERE (x->>'provider') = 'nanogpt' AND (x->>'ok') = 'false') AS failed FROM jsonb_array_elements(t.attempts) x) a
WHERE t.adult_routed
GROUP BY 1;
REVOKE ALL ON public.lounge_nanogpt_stability FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lounge_nanogpt_stability TO service_role;
