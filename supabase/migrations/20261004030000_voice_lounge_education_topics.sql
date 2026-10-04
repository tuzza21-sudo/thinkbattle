-- Apply after 20261004020000_voice_lounge_human_conversation.sql.
-- New forms have film/book identification and no non-media subtype selector.
-- Preserve existing society/show rooms and their original cached research.
BEGIN;
CREATE OR REPLACE FUNCTION public.valid_voice_lounge_topic_brief(p_brief jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE category text; subcategory text;
BEGIN
  IF p_brief IS NULL OR jsonb_typeof(p_brief)<>'object' THEN RETURN false; END IF;
  IF NOT(p_brief ?& ARRAY['category','subcategory','work_title','creator','reason','discussion'])
    OR (SELECT count(*) FROM jsonb_object_keys(p_brief))<>6
    OR EXISTS(SELECT 1 FROM jsonb_each(p_brief) v WHERE jsonb_typeof(v.value)<>'string') THEN RETURN false; END IF;
  category:=p_brief->>'category'; subcategory:=p_brief->>'subcategory';
  IF NOT (CASE category
    WHEN 'media' THEN subcategory IN ('film','book','show')
    WHEN 'hobby' THEN subcategory IN ('general','travel','shopping','food','hobby')
    WHEN 'love' THEN subcategory IN ('general','dating','marriage')
    WHEN 'career' THEN subcategory IN ('general','work','job','path')
    WHEN 'finance' THEN subcategory IN ('general','stocks','money','economy')
    WHEN 'education' THEN subcategory='general'
    WHEN 'society' THEN subcategory IN ('current','daily') ELSE false END) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['reason','discussion']) k
    WHERE length(p_brief->>k) NOT BETWEEN 1 AND 600 OR p_brief->>k !~ '[^[:space:]]')
    OR length(p_brief->>'work_title')>160 OR length(p_brief->>'creator')>100 THEN RETURN false; END IF;
  IF category='media' THEN
    IF p_brief->>'work_title' !~ '[^[:space:]]' THEN RETURN false; END IF;
    IF subcategory IN ('film','book') AND p_brief->>'creator' !~ '[^[:space:]]' THEN RETURN false; END IF;
    IF subcategory='show' AND p_brief->>'creator'<>'' THEN RETURN false; END IF;
  ELSIF p_brief->>'work_title'<>'' OR p_brief->>'creator'<>'' THEN RETURN false;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.valid_voice_lounge_topic_brief(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.valid_voice_lounge_topic_brief(jsonb) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
