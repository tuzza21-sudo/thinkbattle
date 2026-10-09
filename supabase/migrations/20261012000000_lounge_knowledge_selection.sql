-- Apply after 20261011000000_lounge_character_knowledge.sql.
-- 1) A character brings up an anecdote only when it fits, once at a time, and never the same one twice to the same
--    person: the lookup picks at most one experience and two facts, requires a higher match for an experience, skips an
--    experience shown moments ago, and records what it showed for the people who had not heard it. An experience is picked
--    as long as at least one person present has not heard it (and flagged when some of them have, so the character keeps
--    it short); once everyone present has heard it, it is not picked again. Entries are described by tags, a lesson and a
--    kind of experience so they can be found and used better.
-- 2) Facts and the character's own made-up history stay apart: facts carry a source note and the date they hold from, and
--    time-sensitive ones (money, law, medicine) must have that date, so the conversation can say "as of ..." instead of
--    presenting an old figure as today's.
-- The file name does not contain 'voice_lounge' on purpose (see the previous file).
BEGIN;
ALTER TABLE public.lounge_character_knowledge
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lesson text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS source_note text,
  ADD COLUMN IF NOT EXISTS as_of date,
  ADD COLUMN IF NOT EXISTS time_sensitive boolean NOT NULL DEFAULT false;
ALTER TABLE public.lounge_character_knowledge DROP CONSTRAINT IF EXISTS lounge_character_knowledge_selection_check;
ALTER TABLE public.lounge_character_knowledge ADD CONSTRAINT lounge_character_knowledge_selection_check CHECK (
  cardinality(tags) <= 10
  AND (lesson IS NULL OR (kind = 'experience' AND length(btrim(lesson)) BETWEEN 1 AND 300))
  AND (category IS NULL OR (kind = 'experience' AND category IN ('success','failure','decision','conflict','case')))
  AND (source_note IS NULL OR (kind = 'knowledge' AND length(btrim(source_note)) BETWEEN 1 AND 200))
  AND (as_of IS NULL OR kind = 'knowledge')
  AND (NOT time_sensitive OR (kind = 'knowledge' AND as_of IS NOT NULL)));

-- What was shown to the model, so the same anecdote is not told again. Only experiences are recorded: a fact may be
-- repeated, a story may not. One row per person present (or one without a person), kept for good: a row is small and a
-- person never hears the same story twice. The snippet is the start of what had been said.
CREATE TABLE IF NOT EXISTS public.lounge_character_knowledge_uses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id text NOT NULL,
  entry_id uuid NOT NULL REFERENCES public.lounge_character_knowledge(id) ON DELETE CASCADE,
  user_id uuid,
  snippet text,
  used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lounge_knowledge_uses_room_idx ON public.lounge_character_knowledge_uses(room_id, used_at DESC);
CREATE INDEX IF NOT EXISTS lounge_knowledge_uses_entry_idx ON public.lounge_character_knowledge_uses(entry_id, user_id, used_at DESC);
ALTER TABLE public.lounge_character_knowledge_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lounge_character_knowledge_uses FROM PUBLIC, anon, authenticated;

-- The administrator's view gains the new fields and how often an entry was shown lately.
DROP FUNCTION IF EXISTS public.admin_list_lounge_knowledge(text);
CREATE FUNCTION public.admin_list_lounge_knowledge(p_character text DEFAULT NULL)
RETURNS TABLE(id uuid, character_id text, kind text, title text, content text, active boolean, embedded boolean, updated_at timestamptz,
  tags text[], lesson text, category text, source_note text, as_of date, time_sensitive boolean, times_shown integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT k.id, k.character_id, k.kind, k.title, k.content, k.active, k.embedding IS NOT NULL, k.updated_at,
      k.tags, k.lesson, k.category, k.source_note, k.as_of, k.time_sensitive,
      (SELECT count(*)::integer FROM public.lounge_character_knowledge_uses u WHERE u.entry_id = k.id)
    FROM public.lounge_character_knowledge k
    WHERE p_character IS NULL OR k.character_id = p_character
    ORDER BY k.character_id, k.updated_at DESC LIMIT 1000;
END $$;

-- Saves an entry with its embedding. Fields that belong to the other kind are dropped: a lesson and a category only
-- go with an experience, a source note, a date and the time-sensitive flag only with a fact.
DROP FUNCTION IF EXISTS public.admin_save_lounge_knowledge(uuid,text,text,text,text,boolean,real[]);
CREATE OR REPLACE FUNCTION public.admin_save_lounge_knowledge(p_id uuid, p_character text, p_kind text, p_title text, p_content text, p_active boolean, p_embedding real[],
  p_tags text[] DEFAULT '{}', p_lesson text DEFAULT NULL, p_category text DEFAULT NULL, p_source_note text DEFAULT NULL, p_as_of date DEFAULT NULL, p_time_sensitive boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  saved uuid;
  experience boolean := p_kind = 'experience';
  tag_list text[] := coalesce(p_tags, '{}');
  lesson_text text := CASE WHEN experience THEN nullif(btrim(coalesce(p_lesson, '')), '') END;
  category_text text := CASE WHEN experience THEN nullif(btrim(coalesce(p_category, '')), '') END;
  note_text text := CASE WHEN NOT experience THEN nullif(btrim(coalesce(p_source_note, '')), '') END;
  date_value date := CASE WHEN NOT experience THEN p_as_of END;
  sensitive boolean := NOT experience AND coalesce(p_time_sensitive, false);
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.lounge_character_knowledge(character_id, kind, title, content, active, embedding, created_by, tags, lesson, category, source_note, as_of, time_sensitive)
      VALUES (p_character, p_kind, btrim(p_title), btrim(p_content), coalesce(p_active, true), p_embedding, auth.uid(), tag_list, lesson_text, category_text, note_text, date_value, sensitive) RETURNING id INTO saved;
  ELSE
    UPDATE public.lounge_character_knowledge SET character_id = p_character, kind = p_kind, title = btrim(p_title), content = btrim(p_content),
      active = coalesce(p_active, true), embedding = p_embedding, tags = tag_list, lesson = lesson_text, category = category_text,
      source_note = note_text, as_of = date_value, time_sensitive = sensitive, updated_at = now() WHERE id = p_id RETURNING id INTO saved;
    IF saved IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  END IF;
  RETURN saved;
END $$;

-- The conversation's lookup. Picks what to give the model for one turn:
--  * facts: the two closest above p_min_knowledge;
--  * an experience: only one, only if it matches at least p_min_experience, only if no experience was shown in this room in
--    the last 45 seconds, and only if at least one of the people present (p_users) has never heard it. When someone has,
--    `retold` is true. With nobody named, an experience already shown in this room is skipped instead.
-- The experience picked is recorded for the people who had not heard it, in the same call, so a repeat question gets a
-- different answer, now and in every later conversation. Only the server role may call it. Both embeddings have length
-- one, so the dot product is the cosine similarity.
DROP FUNCTION IF EXISTS public.match_lounge_character_knowledge(text,real[],integer,real);
DROP FUNCTION IF EXISTS public.pick_lounge_character_knowledge(text,real[],text,uuid,text,real,real);
DROP FUNCTION IF EXISTS public.pick_lounge_character_knowledge(text,real[],text,uuid[],text,real,real);
CREATE FUNCTION public.pick_lounge_character_knowledge(p_character text, p_query real[], p_room text, p_users uuid[] DEFAULT '{}', p_snippet text DEFAULT NULL,
  p_min_knowledge real DEFAULT 0.3, p_min_experience real DEFAULT 0.45)
RETURNS TABLE(id uuid, kind text, title text, content text, lesson text, category text, as_of date, time_sensitive boolean, retold boolean, score real)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  shown_lately boolean;
  people uuid[] := (coalesce(p_users, '{}'::uuid[]))[1:20];
BEGIN
  IF p_query IS NULL OR cardinality(p_query) <> 256 THEN RETURN; END IF;
  SELECT EXISTS (SELECT 1 FROM public.lounge_character_knowledge_uses u WHERE u.room_id = p_room AND u.used_at > now() - interval '45 seconds') INTO shown_lately;
  RETURN QUERY
  WITH scored AS (
    SELECT k.id AS entry_id, k.kind AS entry_kind, k.title AS entry_title, k.content AS entry_content, k.lesson AS entry_lesson, k.category AS entry_category,
      k.as_of AS entry_as_of, k.time_sensitive AS entry_sensitive,
      (SELECT coalesce(sum(a * b), 0) FROM unnest(k.embedding, p_query) AS t(a, b))::real AS entry_score
    FROM public.lounge_character_knowledge k
    WHERE k.character_id = p_character AND k.active AND k.embedding IS NOT NULL
  ), listeners AS (
    -- Who among the people present has not heard this experience.
    SELECT s.*,
      CASE WHEN s.entry_kind = 'experience' THEN ARRAY(SELECT person FROM unnest(people) AS person
        WHERE NOT EXISTS (SELECT 1 FROM public.lounge_character_knowledge_uses u WHERE u.entry_id = s.entry_id AND u.user_id = person)) END AS fresh,
      s.entry_kind = 'experience' AND EXISTS (SELECT 1 FROM public.lounge_character_knowledge_uses u WHERE u.entry_id = s.entry_id AND u.room_id = p_room) AS told_in_room
    FROM scored s
  ), eligible AS (
    SELECT l.* FROM listeners l
    WHERE (l.entry_kind = 'knowledge' AND l.entry_score >= p_min_knowledge)
      OR (l.entry_kind = 'experience' AND NOT shown_lately AND l.entry_score >= p_min_experience
          AND CASE WHEN cardinality(people) = 0 THEN NOT l.told_in_room ELSE cardinality(l.fresh) > 0 END)
  ), picked AS (
    (SELECT * FROM eligible WHERE entry_kind = 'experience' ORDER BY entry_score DESC LIMIT 1)
    UNION ALL
    (SELECT * FROM eligible WHERE entry_kind = 'knowledge' ORDER BY entry_score DESC LIMIT 2)
  ), logged AS (
    INSERT INTO public.lounge_character_knowledge_uses(room_id, entry_id, user_id, snippet)
      SELECT p_room, picked.entry_id, listener, left(p_snippet, 120)
      FROM picked CROSS JOIN LATERAL unnest(CASE WHEN cardinality(people) = 0 THEN ARRAY[NULL]::uuid[] ELSE picked.fresh END) AS listener
      WHERE picked.entry_kind = 'experience' RETURNING 1
  )
  SELECT picked.entry_id, picked.entry_kind, picked.entry_title, picked.entry_content, picked.entry_lesson, picked.entry_category, picked.entry_as_of, picked.entry_sensitive,
    picked.entry_kind = 'experience' AND cardinality(people) > 0 AND cardinality(picked.fresh) < cardinality(people), picked.entry_score::real
  FROM picked ORDER BY picked.entry_kind DESC, picked.entry_score DESC;
END $$;

REVOKE ALL ON FUNCTION public.admin_list_lounge_knowledge(text),
  public.admin_save_lounge_knowledge(uuid,text,text,text,text,boolean,real[],text[],text,text,text,date,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_lounge_knowledge(text),
  public.admin_save_lounge_knowledge(uuid,text,text,text,text,boolean,real[],text[],text,text,text,date,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.pick_lounge_character_knowledge(text,real[],text,uuid[],text,real,real) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pick_lounge_character_knowledge(text,real[],text,uuid[],text,real,real) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
