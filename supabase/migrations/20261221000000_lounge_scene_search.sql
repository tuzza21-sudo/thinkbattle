BEGIN;
ALTER TABLE public.lounge_scene_backgrounds ADD COLUMN IF NOT EXISTS name text CHECK(name IS NULL OR char_length(name) BETWEEN 1 AND 40);
ALTER TABLE public.lounge_scene_backgrounds ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.lounge_scene_backgrounds ADD COLUMN IF NOT EXISTS name text CHECK(name IS NULL OR char_length(name) BETWEEN 1 AND 40);
ALTER TABLE public.lounge_scene_backgrounds ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.lounge_scene_backgrounds ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'scene' CHECK(source IN ('scene','member'));
ALTER TABLE public.lounge_scene_backgrounds ADD COLUMN IF NOT EXISTS search_document tsvector;
CREATE OR REPLACE FUNCTION public.lounge_scene_search_text(p_text text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT regexp_replace(lower(left(coalesce(p_text,''),1200)), '(레스토랑|식당|카페|커피숍|호텔|라운지|와인바|술집|주방|거실|침실|산악회|버스|자동차|등산로|산장|숲|바다|강변|실내|실외|아침|낮|저녁|밤)', ' \1 ', 'g')
$$;
CREATE OR REPLACE FUNCTION public.index_lounge_scene_background() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 NEW.search_document:=setweight(to_tsvector('simple',lounge_scene_search_text(coalesce(NEW.name,'')||' '||array_to_string(NEW.tags,' '))),'A') || setweight(to_tsvector('simple',lounge_scene_search_text(NEW.description)),'B');
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lounge_scene_search_update ON public.lounge_scene_backgrounds;
CREATE TRIGGER lounge_scene_search_update BEFORE INSERT OR UPDATE OF name,tags,description ON public.lounge_scene_backgrounds FOR EACH ROW EXECUTE FUNCTION public.index_lounge_scene_background();
UPDATE public.lounge_scene_backgrounds SET description=description;
CREATE INDEX IF NOT EXISTS lounge_scene_backgrounds_search ON public.lounge_scene_backgrounds USING gin(search_document);
CREATE INDEX IF NOT EXISTS lounge_scene_backgrounds_creator_daily ON public.lounge_scene_backgrounds(created_by,created_at DESC) WHERE source='member';
CREATE OR REPLACE FUNCTION public.search_lounge_scene_backgrounds(p_query text DEFAULT '',p_limit integer DEFAULT 30)
RETURNS TABLE(id uuid,scene_key text,name text,description text,image_path text,tags text[],uses integer)
LANGUAGE sql STABLE SET search_path=public AS $$
 WITH terms AS (SELECT DISTINCT word FROM regexp_split_to_table(lounge_scene_search_text(left(p_query,200)), '[^a-z0-9가-힣]+') word WHERE length(word)>=1 LIMIT 16),
 query AS (SELECT to_tsquery('simple',coalesce(string_agg(quote_literal(word)||':*',' | '),'')) q FROM terms)
 SELECT s.id,s.scene_key,s.name,s.description,s.image_path,s.tags,s.uses
 FROM public.lounge_scene_backgrounds s CROSS JOIN query
 WHERE btrim(coalesce(p_query,''))='' OR s.search_document@@query.q
 ORDER BY ts_rank(s.search_document,query.q) DESC,s.uses DESC,s.created_at DESC,s.id
 LIMIT greatest(1,least(coalesce(p_limit,30),60))
$$;
REVOKE ALL ON FUNCTION public.search_lounge_scene_backgrounds(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_lounge_scene_backgrounds(text,integer) TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
