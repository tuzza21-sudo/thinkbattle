-- Apply after 20261010000000_voice_lounge_diplomat_lawyer.sql.
-- What each character knows and has lived through, beyond the profile in the code: professional knowledge and
-- first-person experience, added by the super administrator and never edited by visitors. A conversation turn finds
-- the few entries closest to what was just asked and gives only those to the model, so the table can grow without
-- making a turn more expensive.
-- Similarity is a dot product of normalised 256-number embeddings computed in SQL (no extension needed); a few thousand
-- entries per character stay fast. Move to pgvector if a character ever has far more than that.
-- The file name does not contain 'voice_lounge' on purpose: the older isolated-database checks load every file that does.
BEGIN;
CREATE TABLE IF NOT EXISTS public.lounge_character_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id text NOT NULL CHECK (character_id ~ '^[a-z][a-z0-9_]{1,39}$'),
  kind text NOT NULL CHECK (kind IN ('knowledge','experience')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 80),
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 2000),
  embedding real[] CHECK (embedding IS NULL OR cardinality(embedding) = 256),
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lounge_character_knowledge_character_idx ON public.lounge_character_knowledge(character_id, active);
-- Nobody reads or writes the table directly; the server role and the administrator's functions below do.
ALTER TABLE public.lounge_character_knowledge ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lounge_character_knowledge FROM PUBLIC, anon, authenticated;

-- The administrator's view: everything but the embedding numbers.
CREATE OR REPLACE FUNCTION public.admin_list_lounge_knowledge(p_character text DEFAULT NULL)
RETURNS TABLE(id uuid, character_id text, kind text, title text, content text, active boolean, embedded boolean, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT k.id, k.character_id, k.kind, k.title, k.content, k.active, k.embedding IS NOT NULL, k.updated_at
    FROM public.lounge_character_knowledge k
    WHERE p_character IS NULL OR k.character_id = p_character
    ORDER BY k.character_id, k.updated_at DESC LIMIT 1000;
END $$;

-- Saves an entry with its embedding (computed by the server). A null id creates, otherwise it updates.
CREATE OR REPLACE FUNCTION public.admin_save_lounge_knowledge(p_id uuid, p_character text, p_kind text, p_title text, p_content text, p_active boolean, p_embedding real[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE saved uuid;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.lounge_character_knowledge(character_id, kind, title, content, active, embedding, created_by)
      VALUES (p_character, p_kind, btrim(p_title), btrim(p_content), coalesce(p_active, true), p_embedding, auth.uid()) RETURNING id INTO saved;
  ELSE
    UPDATE public.lounge_character_knowledge SET character_id = p_character, kind = p_kind, title = btrim(p_title), content = btrim(p_content),
      active = coalesce(p_active, true), embedding = p_embedding, updated_at = now() WHERE id = p_id RETURNING id INTO saved;
    IF saved IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  END IF;
  RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_lounge_knowledge(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE removed integer;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  DELETE FROM public.lounge_character_knowledge WHERE id = p_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed > 0;
END $$;

-- The conversation's lookup: the active entries of one character closest to the question, best first. Only the
-- server role may call it. Both embeddings are unit length, so the dot product is the cosine similarity.
CREATE OR REPLACE FUNCTION public.match_lounge_character_knowledge(p_character text, p_query real[], p_limit integer DEFAULT 3, p_min real DEFAULT 0.3)
RETURNS TABLE(id uuid, kind text, title text, content text, score real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT k.id, k.kind, k.title, k.content, s.score
  FROM public.lounge_character_knowledge k
  CROSS JOIN LATERAL (SELECT coalesce(sum(a * b), 0)::real AS score FROM unnest(k.embedding, p_query) AS t(a, b)) s
  WHERE k.character_id = p_character AND k.active AND k.embedding IS NOT NULL AND cardinality(p_query) = 256 AND s.score >= p_min
  ORDER BY s.score DESC LIMIT least(greatest(p_limit, 1), 8);
$$;

REVOKE ALL ON FUNCTION public.admin_list_lounge_knowledge(text), public.admin_save_lounge_knowledge(uuid,text,text,text,text,boolean,real[]),
  public.admin_delete_lounge_knowledge(uuid), public.match_lounge_character_knowledge(text,real[],integer,real) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_lounge_knowledge(text), public.admin_save_lounge_knowledge(uuid,text,text,text,text,boolean,real[]),
  public.admin_delete_lounge_knowledge(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.match_lounge_character_knowledge(text,real[],integer,real) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.match_lounge_character_knowledge(text,real[],integer,real) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
