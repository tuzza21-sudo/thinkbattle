-- Apply after 20261008000000_voice_lounge_style_examples_toggle.sql.
-- Long-term memory for one-to-one characters: what the user told this character that is still useful later
-- (projects, preferences, decisions, events) and open threads to follow up. One character never sees another
-- character's memories. Written only by the server role after a reply; sensitive topics are filtered before
-- they reach this table.
BEGIN;
CREATE TABLE IF NOT EXISTS public.voice_lounge_memories(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id text NOT NULL CHECK (character_id ~ '^[a-z][a-z0-9_]{1,39}$'),
  kind text NOT NULL CHECK (kind IN ('project','preference','decision','event','open_thread')),
  summary text NOT NULL CHECK (length(summary) BETWEEN 2 AND 160),
  follow_up text CHECK (follow_up IS NULL OR length(follow_up) BETWEEN 1 AND 120),
  importance numeric(3,2) NOT NULL CHECK (importance BETWEEN 0 AND 1),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','closed','archived')),
  superseded_by uuid REFERENCES public.voice_lounge_memories(id) ON DELETE SET NULL,
  mention_count integer NOT NULL DEFAULT 1 CHECK (mention_count >= 1),
  source_room text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voice_lounge_memories_owner ON public.voice_lounge_memories(user_id, character_id, status);
ALTER TABLE public.voice_lounge_memories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.voice_lounge_memories FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.voice_lounge_memories TO service_role;

-- Applies up to three already validated operations from one reply. Only for the room's own one-to-one host and
-- character. Unknown or inactive targets are skipped. Keeps at most 40 active memories per user and character.
CREATE OR REPLACE FUNCTION public.apply_voice_lounge_memory_ops(p_user uuid, p_character text, p_room text, p_ops jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; op jsonb; target public.voice_lounge_memories; new_id uuid; applied integer := 0;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room;
  IF NOT FOUND OR r.host_id IS DISTINCT FROM p_user OR r.capacity<>1 OR r.host_persona IS DISTINCT FROM p_character THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_ops) IS DISTINCT FROM 'array' OR jsonb_array_length(p_ops) > 3 THEN RAISE EXCEPTION 'invalid memory ops'; END IF;
  FOR op IN SELECT * FROM jsonb_array_elements(p_ops) LOOP
    IF op->>'op'='add' THEN
      INSERT INTO public.voice_lounge_memories(user_id,character_id,kind,summary,follow_up,importance,source_room)
        VALUES(p_user,p_character,op->>'kind',op->>'summary',nullif(op->>'follow_up',''),(op->>'importance')::numeric,p_room);
      applied:=applied+1;
      CONTINUE;
    END IF;
    SELECT * INTO target FROM public.voice_lounge_memories
      WHERE id=(op->>'id')::uuid AND user_id=p_user AND character_id=p_character AND status='active';
    IF NOT FOUND THEN CONTINUE; END IF;
    IF op->>'op'='update' THEN
      UPDATE public.voice_lounge_memories SET summary=coalesce(nullif(op->>'summary',''),summary),
        follow_up=coalesce(nullif(op->>'follow_up',''),follow_up), importance=greatest(importance,coalesce((op->>'importance')::numeric,importance)),
        mention_count=mention_count+1, last_confirmed_at=now(), updated_at=now() WHERE id=target.id;
    ELSIF op->>'op'='supersede' THEN
      INSERT INTO public.voice_lounge_memories(user_id,character_id,kind,summary,follow_up,importance,source_room)
        VALUES(p_user,p_character,coalesce(nullif(op->>'kind',''),target.kind),op->>'summary',nullif(op->>'follow_up',''),coalesce((op->>'importance')::numeric,target.importance),p_room)
        RETURNING id INTO new_id;
      UPDATE public.voice_lounge_memories SET status='superseded', superseded_by=new_id, updated_at=now() WHERE id=target.id;
    ELSIF op->>'op'='close' THEN
      UPDATE public.voice_lounge_memories SET status='closed', updated_at=now() WHERE id=target.id;
    ELSE
      RAISE EXCEPTION 'invalid memory op';
    END IF;
    applied:=applied+1;
  END LOOP;
  UPDATE public.voice_lounge_memories SET status='archived', updated_at=now() WHERE id IN (
    SELECT id FROM public.voice_lounge_memories WHERE user_id=p_user AND character_id=p_character AND status='active'
    ORDER BY importance DESC, last_confirmed_at DESC OFFSET 40);
  RETURN applied;
END $$;
REVOKE ALL ON FUNCTION public.apply_voice_lounge_memory_ops(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_voice_lounge_memory_ops(uuid,text,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
