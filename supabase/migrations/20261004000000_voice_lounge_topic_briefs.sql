-- Apply after 20261003000000_voice_lounge_safety_and_questions.sql.
-- The host's brief is public room metadata, never a private profile or transcript.
BEGIN;
ALTER TABLE public.voice_lounge_rooms ADD COLUMN IF NOT EXISTS topic_brief jsonb;

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
    WHEN 'hobby' THEN subcategory IN ('travel','shopping','food','hobby')
    WHEN 'love' THEN subcategory IN ('dating','marriage')
    WHEN 'career' THEN subcategory IN ('work','job','path')
    WHEN 'finance' THEN subcategory IN ('stocks','money','economy')
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
ALTER TABLE public.voice_lounge_rooms DROP CONSTRAINT IF EXISTS voice_lounge_rooms_topic_brief_check;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_rooms_topic_brief_check
  CHECK(topic_brief IS NULL OR public.valid_voice_lounge_topic_brief(topic_brief));

-- Keep all existing creation overloads for old clients and rooms. New UI uses
-- this overload; validation occurs before creation so no partial room remains.
CREATE OR REPLACE FUNCTION public.create_voice_lounge(
  p_persona text,p_topic text,p_capacity integer,p_nickname text,p_theme text,p_study_required boolean,p_topic_brief jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE room_id text; brief jsonb;
BEGIN
  IF p_topic_brief IS NULL OR jsonb_typeof(p_topic_brief)<>'object' THEN
    RAISE EXCEPTION '방 소개 항목을 확인해 주세요.';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(p_topic_brief) v WHERE jsonb_typeof(v.value)<>'string') THEN
    RAISE EXCEPTION '방 소개 항목을 확인해 주세요.';
  END IF;
  SELECT jsonb_object_agg(key,to_jsonb(regexp_replace(value,'^[[:space:]]+|[[:space:]]+$','','g')))
    INTO brief FROM jsonb_each_text(p_topic_brief);
  IF NOT public.valid_voice_lounge_topic_brief(brief) THEN
    RAISE EXCEPTION '분야, 작품 정보, 방을 만든 이유와 나누고 싶은 이야기를 확인해 주세요.';
  END IF;
  room_id:=public.create_voice_lounge(p_persona,p_topic,p_capacity,p_nickname,p_theme,true);
  UPDATE public.voice_lounge_rooms SET topic_brief=brief WHERE id=room_id AND host_id=auth.uid();
  RETURN room_id;
END $$;

REVOKE ALL ON FUNCTION public.valid_voice_lounge_topic_brief(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.valid_voice_lounge_topic_brief(jsonb) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_voice_lounge(text,text,integer,text,text,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_voice_lounge(text,text,integer,text,text,boolean,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_voice_lounge_study(p_room text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; ticket uuid;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.host_id IS DISTINCT FROM auth.uid() OR NOT public.is_voice_lounge_member(p_room)
    OR r.status='ended' OR coalesce(r.expires_at,r.created_at+interval '2 hours')<=now() THEN RETURN NULL; END IF;
  IF NOT r.study_required THEN RETURN jsonb_build_object('state','skipped'); END IF;
  IF r.topic_study IS NOT NULL THEN RETURN jsonb_build_object('state','ready','study',r.topic_study); END IF;
  IF (r.study_ticket IS NOT NULL AND r.study_ticket_at>now()-interval '90 seconds')
    OR r.study_ticket_at>now()-interval '60 seconds' THEN RETURN jsonb_build_object('state','busy'); END IF;
  IF r.study_attempts>=3 THEN RETURN jsonb_build_object('state','exhausted'); END IF;
  ticket:=gen_random_uuid();
  UPDATE public.voice_lounge_rooms SET study_ticket=ticket,study_ticket_at=now(),study_attempts=study_attempts+1 WHERE id=p_room;
  RETURN jsonb_build_object('state','claimed','ticket',ticket,'topic',r.topic,'topic_brief',r.topic_brief);
END $$;


-- The public list includes only the deliberately published host brief.
DROP FUNCTION IF EXISTS public.list_open_voice_lounges();
CREATE OR REPLACE FUNCTION public.list_open_voice_lounges()
RETURNS TABLE(id text, topic text, host_persona text, theme text, capacity integer,
  status text, participant_count integer, topic_brief jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.topic, r.host_persona, r.theme, r.capacity, r.status,
    (SELECT count(*)::integer FROM public.voice_lounge_members m
      WHERE m.room_id = r.id AND m.active
      AND (m.user_id = r.host_id OR m.last_seen > now() - interval '2 minutes')), r.topic_brief
  FROM public.voice_lounge_rooms r
  WHERE r.capacity > 1 AND r.status IN ('lobby', 'active')
    AND coalesce(r.expires_at, r.created_at + interval '2 hours') > now()
    AND EXISTS (SELECT 1 FROM public.voice_lounge_members h WHERE h.room_id = r.id
      AND h.user_id = r.host_id AND h.active AND h.last_seen > now() - interval '90 seconds')
  ORDER BY (r.status = 'lobby') DESC, r.created_at DESC, r.id
  LIMIT 60;
$$;


REVOKE ALL ON FUNCTION public.list_open_voice_lounges() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_open_voice_lounges() TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
