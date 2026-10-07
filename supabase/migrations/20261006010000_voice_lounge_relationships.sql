-- Apply after 20261006000000_voice_lounge_light_moderation.sql.
-- Long-term relationship state per (user, character) for one-to-one characters.
-- Scores are computed by the API's deterministic engine and written only with
-- the service role; browsers can neither read raw scores nor write them.
BEGIN;
-- Relationship characters are one-to-one conversation partners only.
ALTER TABLE public.voice_lounge_rooms DROP CONSTRAINT IF EXISTS voice_lounge_rooms_host_persona_check;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_rooms_host_persona_check CHECK (
  host_persona IN ('jaeseok','ina','sunny','dodi')
  OR (host_persona IN ('auditor','closer','velvet','trickster') AND capacity=1));
-- Session mood lives with the room, so a new conversation starts from the character's baseline.
ALTER TABLE public.voice_lounge_rooms ADD COLUMN IF NOT EXISTS ai_mood jsonb;

CREATE TABLE IF NOT EXISTS public.voice_lounge_relationships(
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id text NOT NULL CHECK (character_id ~ '^[a-z][a-z0-9_]{1,39}$'),
  scores jsonb NOT NULL CHECK (jsonb_typeof(scores)='object'),
  stage text NOT NULL CHECK (length(stage) BETWEEN 1 AND 60),
  pending jsonb NOT NULL DEFAULT '{"direction":null,"turns":0}'::jsonb,
  recent_events jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(recent_events)='array' AND jsonb_array_length(recent_events)<=50),
  memories jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(memories)='array' AND jsonb_array_length(memories)<=50),
  meaningful_turns integer NOT NULL DEFAULT 0 CHECK (meaningful_turns>=0),
  turn_count integer NOT NULL DEFAULT 0 CHECK (turn_count>=0),
  last_interaction_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version>=1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, character_id)
);
ALTER TABLE public.voice_lounge_relationships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.voice_lounge_relationships FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.voice_lounge_relationships TO service_role;

-- Optimistic save: version 0 creates the row; otherwise the stored version must match.
CREATE OR REPLACE FUNCTION public.save_voice_lounge_relationship(
  p_user uuid, p_character text, p_room text, p_expected_version integer, p_state jsonb, p_mood jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; saved integer; item record;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room;
  IF NOT FOUND OR r.host_id IS DISTINCT FROM p_user OR r.capacity<>1 OR r.host_persona IS DISTINCT FROM p_character THEN RETURN NULL; END IF;
  IF p_expected_version IS NULL OR p_expected_version<0 OR jsonb_typeof(p_state) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_state->'scores') IS DISTINCT FROM 'object' OR jsonb_typeof(p_state->'stage') IS DISTINCT FROM 'string' OR jsonb_typeof(p_state->'pending') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_state->'recentEvents') IS DISTINCT FROM 'array' OR jsonb_typeof(p_state->'memories') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_state->'turnCount') IS DISTINCT FROM 'number' OR jsonb_typeof(p_state->'meaningfulTurns') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'invalid relationship state';
  END IF;
  FOR item IN SELECT * FROM jsonb_each(p_state->'scores') LOOP
    IF jsonb_typeof(item.value) IS DISTINCT FROM 'number' OR (item.value#>>'{}')::numeric NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'invalid relationship score'; END IF;
  END LOOP;
  IF p_expected_version=0 THEN
    INSERT INTO public.voice_lounge_relationships(user_id,character_id,scores,stage,pending,recent_events,memories,meaningful_turns,turn_count,last_interaction_at)
      VALUES(p_user,p_character,p_state->'scores',p_state->>'stage',p_state->'pending',p_state->'recentEvents',p_state->'memories',
        (p_state->>'meaningfulTurns')::integer,(p_state->>'turnCount')::integer,(p_state->>'lastInteractionAt')::timestamptz)
      ON CONFLICT (user_id,character_id) DO NOTHING RETURNING version INTO saved;
  ELSE
    UPDATE public.voice_lounge_relationships SET scores=p_state->'scores',stage=p_state->>'stage',pending=p_state->'pending',
      recent_events=p_state->'recentEvents',memories=p_state->'memories',meaningful_turns=(p_state->>'meaningfulTurns')::integer,
      turn_count=(p_state->>'turnCount')::integer,last_interaction_at=(p_state->>'lastInteractionAt')::timestamptz,
      version=version+1,updated_at=now()
      WHERE user_id=p_user AND character_id=p_character AND version=p_expected_version RETURNING version INTO saved;
  END IF;
  IF saved IS NOT NULL AND jsonb_typeof(p_mood)='object' THEN UPDATE public.voice_lounge_rooms SET ai_mood=p_mood WHERE id=p_room; END IF;
  RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.save_voice_lounge_relationship(uuid,text,text,integer,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_voice_lounge_relationship(uuid,text,text,integer,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
