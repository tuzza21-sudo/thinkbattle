-- Apply after 20261127000000_lounge_long_chat_keeps_story.sql.
-- (2026-10-29) What a member can see and change about a one-to-one character, and who they are in the conversation:
--   - voice_lounge_relationship_milestones: every stage change of a relationship, written by a trigger, so the member
--     can see how the relationship went (before this nothing kept the history; only the current stage was stored).
--   - get_my_lounge_memory / edit_ / forget_ / add_my_lounge_memory / forget_my_lounge_event: the member reads the
--     character's long-term memories of them (40 at most), the important events of the relationship and its timeline,
--     and edits, forgets or adds memories. Each acts only on the caller's own rows.
--   - lounge_member_personas: up to five personas per member (who they are in a conversation: a name to be called,
--     job, personality, anything else); one may be the default. voice_lounge_rooms.member_persona is the one chosen for
--     a room (a copy; {"none":true} for none; null uses the default). The server reads it for the character.
--   - lounge_character_posts.image_model: which image model made a photo, to compare models.
BEGIN;

-- 1. The relationship timeline.
CREATE TABLE IF NOT EXISTS public.voice_lounge_relationship_milestones(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id text NOT NULL CHECK (length(character_id) BETWEEN 1 AND 60),
  from_stage text CHECK (from_stage IS NULL OR length(from_stage) BETWEEN 1 AND 60),
  to_stage text NOT NULL CHECK (length(to_stage) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voice_lounge_relationship_milestones_owner ON public.voice_lounge_relationship_milestones(user_id, character_id, created_at);
ALTER TABLE public.voice_lounge_relationship_milestones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.voice_lounge_relationship_milestones FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.voice_lounge_relationship_milestones TO service_role;

CREATE OR REPLACE FUNCTION public.voice_lounge_relationship_milestone() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO public.voice_lounge_relationship_milestones(user_id,character_id,from_stage,to_stage)
      VALUES(NEW.user_id,NEW.character_id,CASE WHEN TG_OP='UPDATE' THEN OLD.stage END,NEW.stage);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS voice_lounge_relationship_milestone ON public.voice_lounge_relationships;
CREATE TRIGGER voice_lounge_relationship_milestone AFTER INSERT OR UPDATE OF stage ON public.voice_lounge_relationships
  FOR EACH ROW EXECUTE FUNCTION public.voice_lounge_relationship_milestone();

-- 2. The member's view of a character's memories, events and timeline, and their changes.
CREATE OR REPLACE FUNCTION public.get_my_lounge_memory(p_character text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'memories', coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'summary',m.summary,'follow_up',m.follow_up,
        'importance',m.importance,'created_at',m.created_at,'updated_at',m.updated_at)
        ORDER BY m.kind='open_thread' DESC, m.importance DESC, m.updated_at DESC)
      FROM public.voice_lounge_memories m WHERE m.user_id=auth.uid() AND m.character_id=p_character AND m.status='active'), '[]'::jsonb),
    'relationship', (SELECT jsonb_build_object('stage',r.stage,'events',r.memories,'started_at',r.created_at,'turn_count',r.turn_count,'last_at',r.last_interaction_at)
      FROM public.voice_lounge_relationships r WHERE r.user_id=auth.uid() AND r.character_id=p_character),
    'milestones', coalesce((SELECT jsonb_agg(jsonb_build_object('from',x.from_stage,'to',x.to_stage,'at',x.created_at) ORDER BY x.created_at)
      FROM public.voice_lounge_relationship_milestones x WHERE x.user_id=auth.uid() AND x.character_id=p_character), '[]'::jsonb),
    'limit', 40)
  WHERE auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.edit_my_lounge_memory(p_id uuid, p_summary text, p_follow_up text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s text := btrim(regexp_replace(coalesce(p_summary,''),'\s+',' ','g')); f text := nullif(btrim(regexp_replace(coalesce(p_follow_up,''),'\s+',' ','g')),'');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF length(s) NOT BETWEEN 2 AND 160 THEN RAISE EXCEPTION '기억은 2~160자로 적어 주세요.'; END IF;
  IF f IS NOT NULL AND length(f) > 120 THEN RAISE EXCEPTION '다음에 물어볼 것은 120자까지 적을 수 있어요.'; END IF;
  -- A memory the member wrote themselves is one they care about: it is kept ahead of the unimportant ones.
  UPDATE public.voice_lounge_memories SET summary=s, follow_up=f, importance=greatest(importance,0.7), last_confirmed_at=now(), updated_at=now()
    WHERE id=p_id AND user_id=auth.uid() AND status='active';
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.forget_my_lounge_memory(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  UPDATE public.voice_lounge_memories SET status='archived', updated_at=now() WHERE id=p_id AND user_id=auth.uid() AND status='active';
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.add_my_lounge_memory(p_character text, p_kind text, p_summary text, p_follow_up text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s text := btrim(regexp_replace(coalesce(p_summary,''),'\s+',' ','g')); f text := nullif(btrim(regexp_replace(coalesce(p_follow_up,''),'\s+',' ','g')),''); new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF p_character IS NULL OR p_character !~ '^[a-z][a-z0-9_]{1,39}$' THEN RAISE EXCEPTION '캐릭터를 확인해 주세요.'; END IF;
  IF p_kind NOT IN ('project','preference','decision','event','open_thread') THEN RAISE EXCEPTION '기억의 종류를 골라 주세요.'; END IF;
  IF length(s) NOT BETWEEN 2 AND 160 THEN RAISE EXCEPTION '기억은 2~160자로 적어 주세요.'; END IF;
  IF f IS NOT NULL AND length(f) > 120 THEN RAISE EXCEPTION '다음에 물어볼 것은 120자까지 적을 수 있어요.'; END IF;
  INSERT INTO public.voice_lounge_memories(user_id,character_id,kind,summary,follow_up,importance)
    VALUES(auth.uid(),p_character,p_kind,s,f,0.75) RETURNING id INTO new_id;
  -- The same limit as the memories the character writes: 40 kept, the least important set aside.
  UPDATE public.voice_lounge_memories SET status='archived', updated_at=now() WHERE id IN (
    SELECT id FROM public.voice_lounge_memories WHERE user_id=auth.uid() AND character_id=p_character AND status='active'
    ORDER BY importance DESC, last_confirmed_at DESC OFFSET 40);
  RETURN new_id;
END $$;

-- An important event of the relationship (kept in voice_lounge_relationships.memories) the member wants gone. The
-- version moves on, so a turn being saved at the same moment does not write it back.
CREATE OR REPLACE FUNCTION public.forget_my_lounge_event(p_character text, p_at text, p_summary text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  UPDATE public.voice_lounge_relationships SET
    memories=(SELECT coalesce(jsonb_agg(e ORDER BY n),'[]'::jsonb) FROM jsonb_array_elements(memories) WITH ORDINALITY AS t(e,n)
      WHERE NOT (e->>'at' IS NOT DISTINCT FROM p_at AND e->>'summary' IS NOT DISTINCT FROM p_summary)),
    version=version+1, updated_at=now()
    WHERE user_id=auth.uid() AND character_id=p_character
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(memories) e WHERE e->>'at' IS NOT DISTINCT FROM p_at AND e->>'summary' IS NOT DISTINCT FROM p_summary);
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.get_my_lounge_memory(text), public.edit_my_lounge_memory(uuid,text,text), public.forget_my_lounge_memory(uuid),
  public.add_my_lounge_memory(text,text,text,text), public.forget_my_lounge_event(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_lounge_memory(text), public.edit_my_lounge_memory(uuid,text,text), public.forget_my_lounge_memory(uuid),
  public.add_my_lounge_memory(text,text,text,text), public.forget_my_lounge_event(text,text,text) TO authenticated;

-- 3. Personas.
CREATE TABLE IF NOT EXISTS public.lounge_member_personas(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 30),
  call_name text NOT NULL DEFAULT '' CHECK (length(call_name) <= 20),
  job text NOT NULL DEFAULT '' CHECK (length(job) <= 60),
  personality text NOT NULL DEFAULT '' CHECK (length(personality) <= 200),
  details text NOT NULL DEFAULT '' CHECK (length(details) <= 600),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lounge_member_personas_owner ON public.lounge_member_personas(user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS lounge_member_personas_one_default ON public.lounge_member_personas(user_id) WHERE is_default;
ALTER TABLE public.lounge_member_personas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_member_personas FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lounge_member_personas TO authenticated;
GRANT SELECT ON TABLE public.lounge_member_personas TO service_role;
DROP POLICY IF EXISTS lounge_member_personas_own ON public.lounge_member_personas;
CREATE POLICY lounge_member_personas_own ON public.lounge_member_personas FOR ALL TO authenticated
  USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());

-- At most five per member; a new default takes the place of the old one.
CREATE OR REPLACE FUNCTION public.lounge_member_persona_rules() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' AND (SELECT count(*) FROM public.lounge_member_personas WHERE user_id=NEW.user_id) >= 5 THEN
    RAISE EXCEPTION '페르소나는 다섯 개까지 만들 수 있어요.';
  END IF;
  IF NEW.is_default THEN
    UPDATE public.lounge_member_personas SET is_default=false WHERE user_id=NEW.user_id AND id<>NEW.id AND is_default;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lounge_member_persona_rules ON public.lounge_member_personas;
CREATE TRIGGER lounge_member_persona_rules BEFORE INSERT OR UPDATE ON public.lounge_member_personas
  FOR EACH ROW EXECUTE FUNCTION public.lounge_member_persona_rules();

ALTER TABLE public.voice_lounge_rooms ADD COLUMN IF NOT EXISTS member_persona jsonb
  CHECK (member_persona IS NULL OR jsonb_typeof(member_persona)='object');

-- The persona for one's own one-to-one room: a copy of one of one's personas, none at all (p_none), or the default (both null).
CREATE OR REPLACE FUNCTION public.set_lounge_room_persona(p_room text, p_persona uuid DEFAULT NULL, p_none boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.lounge_member_personas; chosen jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.voice_lounge_rooms WHERE id=p_room AND host_id=auth.uid() AND capacity=1 AND space_id IS NULL) THEN
    RAISE EXCEPTION '내 1:1 대화에서만 페르소나를 고를 수 있어요.';
  END IF;
  IF p_persona IS NOT NULL THEN
    SELECT * INTO p FROM public.lounge_member_personas WHERE id=p_persona AND user_id=auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION '페르소나를 찾지 못했어요.'; END IF;
    chosen := jsonb_build_object('id',p.id,'title',p.title,'call_name',p.call_name,'job',p.job,'personality',p.personality,'details',p.details);
  ELSIF p_none THEN chosen := jsonb_build_object('none',true);
  END IF;
  UPDATE public.voice_lounge_rooms SET member_persona=chosen WHERE id=p_room;
  RETURN chosen;
END $$;
REVOKE ALL ON FUNCTION public.set_lounge_room_persona(text,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lounge_room_persona(text,uuid,boolean) TO authenticated;

-- 4. Which image model made a photo.
ALTER TABLE public.lounge_character_posts ADD COLUMN IF NOT EXISTS image_model text CHECK (image_model IS NULL OR length(image_model) <= 40);

NOTIFY pgrst,'reload schema';
COMMIT;
