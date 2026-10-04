-- Apply after 20261004000000_voice_lounge_topic_briefs.sql.
-- Keep study JSON backward compatible; new film studies store scene cards.
BEGIN;
CREATE OR REPLACE FUNCTION public.valid_voice_lounge_film_research(p_film jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE material jsonb; card jsonb; item jsonb; link jsonb; known_urls text[]; ids text[]:='{}';
BEGIN
  IF p_film IS NULL OR jsonb_typeof(p_film)<>'object' THEN RETURN false; END IF;
  IF NOT(p_film ?& ARRAY['version','coverage','materials','cards']) OR p_film->'version'<>'2'::jsonb
    OR jsonb_typeof(p_film->'coverage')<>'string' OR p_film->>'coverage' NOT IN ('scene_grounded','limited')
    OR jsonb_typeof(p_film->'materials')<>'array' OR jsonb_typeof(p_film->'cards')<>'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p_film->'materials')>4 OR jsonb_array_length(p_film->'cards')>5
    OR (p_film->>'coverage'='scene_grounded')<>(jsonb_array_length(p_film->'cards')>0) THEN RETURN false; END IF;
  FOR material IN SELECT * FROM jsonb_array_elements(p_film->'materials') LOOP
    IF jsonb_typeof(material)<>'object' THEN RETURN false; END IF;
    IF NOT(material ?& ARRAY['title','url','provider','retrieved_at'])
      OR EXISTS(SELECT 1 FROM jsonb_each(material) v WHERE jsonb_typeof(v.value)<>'string')
      OR length(material->>'title') NOT BETWEEN 1 AND 120 OR length(material->>'url')>1500
      OR material->>'url' !~ '^https://(www\.)?(kmdb\.or\.kr|koreafilm\.or\.kr|cine21\.com|bfi\.org\.uk|criterion\.com|themoviedb\.org)/'
      OR material->>'provider' NOT IN ('KMDb','한국영상자료원','씨네21','BFI','Criterion','TMDB')
      OR material->>'retrieved_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' THEN RETURN false; END IF;
  END LOOP;
  SELECT coalesce(array_agg(v->>'url'),'{}') INTO known_urls FROM jsonb_array_elements(p_film->'materials') v;
  FOR card IN SELECT * FROM jsonb_array_elements(p_film->'cards') LOOP
    IF jsonb_typeof(card)<>'object' THEN RETURN false; END IF;
    IF NOT(card ?& ARRAY['id','axis','scene','conflict','evidence','interpretations','question','followups','spoiler'])
      OR EXISTS(SELECT 1 FROM unnest(ARRAY['id','axis','scene','conflict','question','spoiler']) k WHERE jsonb_typeof(card->k)<>'string')
      OR EXISTS(SELECT 1 FROM unnest(ARRAY['evidence','interpretations','followups']) k WHERE jsonb_typeof(card->k)<>'array') THEN RETURN false; END IF;
    IF length(trim(card->>'id')) NOT BETWEEN 1 AND 40 OR card->>'id'=ANY(ids)
      OR card->>'axis' NOT IN ('character','power','perspective','form','ending') OR card->>'spoiler' NOT IN ('scene','ending')
      OR (card->>'axis'='ending' AND card->>'spoiler'<>'ending')
      OR EXISTS(SELECT 1 FROM unnest(ARRAY['id','scene','conflict','question']) k WHERE card->>k !~ '[^[:space:]]')
      OR EXISTS(SELECT 1 FROM unnest(ARRAY['scene','conflict']) k WHERE length(trim(card->>k)) NOT BETWEEN 1 AND 240)
      OR length(trim(card->>'question')) NOT BETWEEN 1 AND 180
      OR jsonb_array_length(card->'evidence') NOT BETWEEN 1 AND 4
      OR jsonb_array_length(card->'interpretations') NOT BETWEEN 2 AND 3
      OR jsonb_array_length(card->'followups') NOT BETWEEN 2 AND 3 THEN RETURN false; END IF;
    ids:=array_append(ids,card->>'id');
    FOR item IN SELECT * FROM jsonb_array_elements((card->'evidence')||(card->'interpretations')) LOOP
      IF jsonb_typeof(item)<>'object' THEN RETURN false; END IF;
      IF NOT(item ?& ARRAY['kind','text','source_urls']) OR jsonb_typeof(item->'kind')<>'string' OR jsonb_typeof(item->'text')<>'string'
        OR jsonb_typeof(item->'source_urls')<>'array' THEN RETURN false; END IF;
      IF item->>'kind' NOT IN ('scene_fact','director_statement','critic_interpretation','ai_inference')
        OR length(trim(item->>'text')) NOT BETWEEN 1 AND 240 OR item->>'text' !~ '[^[:space:]]' OR jsonb_array_length(item->'source_urls')>4
        OR (item->>'kind'<>'ai_inference' AND jsonb_array_length(item->'source_urls')=0) THEN RETURN false; END IF;
      FOR link IN SELECT * FROM jsonb_array_elements(item->'source_urls') LOOP
        IF jsonb_typeof(link)<>'string' OR NOT(link#>>'{}'=ANY(known_urls)) THEN RETURN false; END IF;
      END LOOP;
    END LOOP;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(card->'evidence') e WHERE e->>'kind'='scene_fact' AND jsonb_array_length(e->'source_urls')>0) THEN RETURN false; END IF;
    FOR item IN SELECT * FROM jsonb_array_elements(card->'interpretations') LOOP
      IF item->>'kind' NOT IN ('critic_interpretation','ai_inference') OR NOT(item ? 'basis')
        OR jsonb_typeof(item->'basis')<>'string' OR length(trim(item->>'basis')) NOT BETWEEN 1 AND 240 OR item->>'basis' !~ '[^[:space:]]' THEN RETURN false; END IF;
    END LOOP;
    FOR item IN SELECT * FROM jsonb_array_elements(card->'followups') LOOP
      IF jsonb_typeof(item)<>'object' THEN RETURN false; END IF;
      IF NOT(item ?& ARRAY['if_answer','question']) OR jsonb_typeof(item->'if_answer')<>'string' OR jsonb_typeof(item->'question')<>'string'
        OR length(trim(item->>'if_answer')) NOT BETWEEN 1 AND 100 OR length(trim(item->>'question')) NOT BETWEEN 1 AND 180
        OR item->>'if_answer' !~ '[^[:space:]]' OR item->>'question' !~ '[^[:space:]]' THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.finish_voice_lounge_study(p_room text,p_ticket uuid,p_study jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_study IS NULL OR jsonb_typeof(p_study)<>'object' OR octet_length(p_study::text)>48000 THEN RETURN false; END IF;
  IF NOT(p_study ?& ARRAY['title','confidence','overview','facts','angles','questions','clarification','sources'])
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['title','confidence','overview','clarification']) k WHERE jsonb_typeof(p_study->k)<>'string')
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['facts','angles','questions','sources']) k WHERE jsonb_typeof(p_study->k)<>'array') THEN RETURN false; END IF;
  IF p_study->>'confidence' NOT IN ('verified','uncertain') OR jsonb_array_length(p_study->'sources')>8
    OR EXISTS(SELECT 1 FROM jsonb_array_elements((p_study->'facts')||(p_study->'angles')||(p_study->'questions')) v WHERE jsonb_typeof(v)<>'string') THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_study->'sources') v WHERE jsonb_typeof(v)<>'object') THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_study->'sources') v WHERE NOT(v ?& ARRAY['title','url'])
    OR jsonb_typeof(v->'title')<>'string' OR jsonb_typeof(v->'url')<>'string' OR v->>'url' !~ '^https?://') THEN RETURN false; END IF;
  IF p_study ? 'film_research' AND NOT public.valid_voice_lounge_film_research(p_study->'film_research') THEN RETURN false; END IF;
  IF p_study#>>'{film_research,coverage}'='scene_grounded' AND p_study->>'confidence'<>'verified' THEN RETURN false; END IF;
  UPDATE public.voice_lounge_rooms SET topic_study=p_study,study_ticket=NULL
    WHERE id=p_room AND host_id=auth.uid() AND public.is_voice_lounge_member(p_room)
    AND status<>'ended' AND coalesce(expires_at,created_at+interval '2 hours')>now()
    AND study_ticket=p_ticket AND study_ticket_at>now()-interval '90 seconds' AND topic_study IS NULL;
  RETURN FOUND;
END $$;

-- Rebuild earlier spoiler-free film notes once. New/limited version-2 notes and
-- non-film studies remain cached; repeat SQL Editor runs do not clear them.
UPDATE public.voice_lounge_rooms SET topic_study=NULL,study_attempts=0,study_ticket=NULL,study_ticket_at=NULL
  WHERE topic_study IS NOT NULL AND status<>'ended'
    AND coalesce(expires_at,created_at+interval '2 hours')>now()
    AND topic_study#>>'{film_research,version}' IS DISTINCT FROM '2'
    AND ((topic_brief->>'category'='media' AND topic_brief->>'subcategory'='film')
      OR (topic_brief IS NULL AND topic ~* '(영화|\mfilm\M|\mmovie\M)'));
REVOKE ALL ON FUNCTION public.valid_voice_lounge_film_research(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.valid_voice_lounge_film_research(jsonb) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.finish_voice_lounge_study(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finish_voice_lounge_study(text,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
