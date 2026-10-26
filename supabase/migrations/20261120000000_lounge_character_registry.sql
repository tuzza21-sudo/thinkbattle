-- Apply after 20261119000000_lounge_ina_becomes_seoyeon.sql.
-- Adding a house character no longer needs SQL (2026-10-26). The eight characters were written into three CHECK
-- constraints and five functions, so every new character meant a migration to run by hand. They now read one small table,
-- lounge_house_characters: a new character is one row there (scripts/new-lounge-character.mjs --register does it with the
-- service key). The same eight ids are seeded, so nothing changes for the characters that exist.
--   - rooms.host_persona and spaces.host_persona: a registered house character, or a member's character (c_ + 32 hex)
--   - lounge_scenarios.character_id: a registered house character
--   - open_voice_lounge_table (3 overloads), set_voice_lounge_persona, start_voice_lounge_solo: the same test, by function
-- The function bodies below are the latest definitions of each, copied as they were, with only the list replaced.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lounge_house_characters (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9]{1,23}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lounge_house_characters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_house_characters FROM PUBLIC, anon, authenticated;
INSERT INTO public.lounge_house_characters(id) VALUES ('jaeseok'),('ina'),('auditor'),('closer'),('velvet'),('trickster'),('diplomat'),('lawyer')
  ON CONFLICT (id) DO NOTHING;

-- A registered house character. SECURITY DEFINER because the table is closed to everyone but the service key.
CREATE OR REPLACE FUNCTION public.is_lounge_house_character(p_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.lounge_house_characters WHERE id=p_id)
$$;
-- A house character, or a member's character.
CREATE OR REPLACE FUNCTION public.is_lounge_character(p_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p_id IS NOT NULL AND (p_id ~ '^c_[0-9a-f]{32}$' OR public.is_lounge_house_character(p_id))
$$;
REVOKE ALL ON FUNCTION public.is_lounge_house_character(text), public.is_lounge_character(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_lounge_house_character(text), public.is_lounge_character(text) TO anon, authenticated, service_role;

ALTER TABLE public.voice_lounge_rooms DROP CONSTRAINT IF EXISTS voice_lounge_rooms_host_persona_check;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_rooms_host_persona_check CHECK (public.is_lounge_character(host_persona));
ALTER TABLE public.voice_lounge_spaces DROP CONSTRAINT IF EXISTS voice_lounge_spaces_host_persona_check;
ALTER TABLE public.voice_lounge_spaces ADD CONSTRAINT voice_lounge_spaces_host_persona_check CHECK (public.is_lounge_house_character(host_persona));

-- The scenarios table came later; its check was written inline on the column, so it is found by its text.
DO $$
DECLARE c record;
BEGIN
  IF to_regclass('public.lounge_scenarios') IS NULL THEN RETURN; END IF;
  FOR c IN SELECT conname FROM pg_constraint
    WHERE contype='c' AND conrelid='public.lounge_scenarios'::regclass AND pg_get_constraintdef(oid) LIKE '%jaeseok%'
  LOOP
    EXECUTE format('ALTER TABLE public.lounge_scenarios DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.lounge_scenarios DROP CONSTRAINT IF EXISTS lounge_scenarios_character_id_check;
  ALTER TABLE public.lounge_scenarios ADD CONSTRAINT lounge_scenarios_character_id_check CHECK (public.is_lounge_house_character(character_id));
END $$;

-- open_voice_lounge_table(text, text, text, text), as defined in 20261015000000_voice_lounge_rooms_by_place.sql
CREATE OR REPLACE FUNCTION public.open_voice_lounge_table(p_space text,p_nickname text,p_topic text,p_persona text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.voice_lounge_spaces; picked text; next_no integer; name text:=left(btrim(coalesce(p_nickname,'')),30);
  body text:=btrim(coalesce(p_topic,''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF name='' THEN RAISE EXCEPTION '닉네임을 확인해 주세요.'; END IF;
  PERFORM public.voice_lounge_require_gender();
  IF length(body) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION '대화 주제는 1~80자로 적어 주세요.'; END IF;
  IF p_persona IS NULL OR NOT public.is_lounge_house_character(p_persona) THEN
    RAISE EXCEPTION '대화를 도와줄 캐릭터를 골라 주세요.';
  END IF;
  SELECT * INTO s FROM public.voice_lounge_spaces WHERE id=p_space AND open;
  IF NOT FOUND THEN RAISE EXCEPTION '지금은 열려 있지 않은 장소예요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-space:'||p_space,96));
  PERFORM public.tidy_voice_lounge_space(p_space);
  SELECT min(n) INTO next_no FROM generate_series(1,999) n
    WHERE NOT EXISTS(SELECT 1 FROM public.voice_lounge_rooms WHERE space_id=p_space AND status='active' AND table_no=n);
  INSERT INTO public.voice_lounge_rooms(host_id,host_persona,topic,topic_source,topic_set_by,topic_set_at,capacity,status,
      started_at,expires_at,theme,space_id,table_no,guided_session,study_required)
    VALUES(auth.uid(),p_persona,body,'member',name,now(),s.capacity,'active',now(),now()+interval '30 minutes',s.theme,p_space,next_no,false,false)
    RETURNING id INTO picked;
  UPDATE public.voice_lounge_members m SET active=false FROM public.voice_lounge_rooms o
    WHERE m.room_id=o.id AND m.user_id=auth.uid() AND m.active AND o.space_id IS NOT NULL AND o.id<>picked;
  INSERT INTO public.voice_lounge_members(room_id,user_id,nickname) VALUES(picked,auth.uid(),name);
  DELETE FROM public.voice_lounge_waitlist WHERE user_id=auth.uid();
  PERFORM public.close_empty_voice_lounge_tables(auth.uid());
  RETURN picked;
END $$;

-- open_voice_lounge_table(text, text, text, text, text[]), as defined in 20261017000000_voice_lounge_age_limits_and_free_solo.sql
CREATE OR REPLACE FUNCTION public.open_voice_lounge_table(p_space text,p_nickname text,p_topic text,p_persona text,p_ages text[] DEFAULT '{}') RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.voice_lounge_spaces; picked text; next_no integer; name text:=left(btrim(coalesce(p_nickname,'')),30);
  body text:=btrim(coalesce(p_topic,'')); ages text[]:=coalesce(p_ages,'{}');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF name='' THEN RAISE EXCEPTION '닉네임을 확인해 주세요.'; END IF;
  IF length(body) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION '대화 주제는 1~80자로 적어 주세요.'; END IF;
  IF p_persona IS NULL OR NOT public.is_lounge_house_character(p_persona) THEN
    RAISE EXCEPTION '대화를 도와줄 캐릭터를 골라 주세요.';
  END IF;
  IF NOT ages <@ ARRAY['20s','30s','40s','50s','60s']::text[] THEN RAISE EXCEPTION '올바르지 않은 연령대예요.'; END IF;
  SELECT * INTO s FROM public.voice_lounge_spaces WHERE id=p_space AND open;
  IF NOT FOUND THEN RAISE EXCEPTION '지금은 열려 있지 않은 장소예요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-space:'||p_space,96));
  PERFORM public.tidy_voice_lounge_space(p_space);
  SELECT min(n) INTO next_no FROM generate_series(1,999) n
    WHERE NOT EXISTS(SELECT 1 FROM public.voice_lounge_rooms WHERE space_id=p_space AND status='active' AND table_no=n);
  INSERT INTO public.voice_lounge_rooms(host_id,host_persona,topic,topic_source,topic_set_by,topic_set_at,capacity,status,
      started_at,expires_at,theme,space_id,table_no,guided_session,study_required,age_groups)
    VALUES(auth.uid(),p_persona,body,'member',name,now(),s.capacity,'active',now(),now()+interval '30 minutes',s.theme,p_space,next_no,false,false,
      (SELECT coalesce(array_agg(a ORDER BY a),'{}') FROM (SELECT DISTINCT unnest(ages) a) x))
    RETURNING id INTO picked;
  UPDATE public.voice_lounge_members m SET active=false FROM public.voice_lounge_rooms o
    WHERE m.room_id=o.id AND m.user_id=auth.uid() AND m.active AND o.space_id IS NOT NULL AND o.id<>picked;
  INSERT INTO public.voice_lounge_members(room_id,user_id,nickname) VALUES(picked,auth.uid(),name);
  DELETE FROM public.voice_lounge_waitlist WHERE user_id=auth.uid();
  PERFORM public.close_empty_voice_lounge_tables(auth.uid());
  RETURN picked;
END $$;

-- open_voice_lounge_table(text, text, text, text, text[], integer), as defined in 20261027000000_voice_lounge_table_capacity.sql
CREATE OR REPLACE FUNCTION public.open_voice_lounge_table(p_space text,p_nickname text,p_topic text,p_persona text,p_ages text[] DEFAULT '{}',p_capacity integer DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.voice_lounge_spaces; picked text; next_no integer; name text:=left(btrim(coalesce(p_nickname,'')),30);
  body text:=btrim(coalesce(p_topic,'')); ages text[]:=coalesce(p_ages,'{}'); seats integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF name='' THEN RAISE EXCEPTION '닉네임을 확인해 주세요.'; END IF;
  IF length(body) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION '대화 주제는 1~80자로 적어 주세요.'; END IF;
  IF p_persona IS NULL OR NOT public.is_lounge_house_character(p_persona) THEN
    RAISE EXCEPTION '대화를 도와줄 캐릭터를 골라 주세요.';
  END IF;
  IF NOT ages <@ ARRAY['20s','30s','40s','50s','60s']::text[] THEN RAISE EXCEPTION '올바르지 않은 연령대예요.'; END IF;
  SELECT * INTO s FROM public.voice_lounge_spaces WHERE id=p_space AND open;
  IF NOT FOUND THEN RAISE EXCEPTION '지금은 열려 있지 않은 장소예요.'; END IF;
  seats:=coalesce(p_capacity,s.capacity);
  IF seats<2 OR seats>s.capacity THEN RAISE EXCEPTION '방 인원은 2명부터 %명까지 정할 수 있어요.',s.capacity; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-space:'||p_space,96));
  PERFORM public.tidy_voice_lounge_space(p_space);
  SELECT min(n) INTO next_no FROM generate_series(1,999) n
    WHERE NOT EXISTS(SELECT 1 FROM public.voice_lounge_rooms WHERE space_id=p_space AND status='active' AND table_no=n);
  INSERT INTO public.voice_lounge_rooms(host_id,host_persona,topic,topic_source,topic_set_by,topic_set_at,capacity,status,
      started_at,expires_at,theme,space_id,table_no,guided_session,study_required,age_groups)
    VALUES(auth.uid(),p_persona,body,'member',name,now(),seats,'active',now(),now()+interval '30 minutes',s.theme,p_space,next_no,false,false,
      (SELECT coalesce(array_agg(a ORDER BY a),'{}') FROM (SELECT DISTINCT unnest(ages) a) x))
    RETURNING id INTO picked;
  UPDATE public.voice_lounge_members m SET active=false FROM public.voice_lounge_rooms o
    WHERE m.room_id=o.id AND m.user_id=auth.uid() AND m.active AND o.space_id IS NOT NULL AND o.id<>picked;
  INSERT INTO public.voice_lounge_members(room_id,user_id,nickname) VALUES(picked,auth.uid(),name);
  DELETE FROM public.voice_lounge_waitlist WHERE user_id=auth.uid();
  PERFORM public.close_empty_voice_lounge_tables(auth.uid());
  RETURN picked;
END $$;

-- set_voice_lounge_persona(text, text), as defined in 20261015000000_voice_lounge_rooms_by_place.sql
CREATE OR REPLACE FUNCTION public.set_voice_lounge_persona(p_room text,p_persona text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.space_id IS NULL OR r.status<>'active' OR NOT public.is_voice_lounge_member(p_room) THEN RAISE EXCEPTION '이 대화방의 캐릭터를 바꿀 수 없어요.'; END IF;
  IF r.host_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION '방장만 캐릭터를 바꿀 수 있어요.'; END IF;
  IF p_persona IS NULL OR NOT public.is_lounge_house_character(p_persona) THEN
    RAISE EXCEPTION '대화를 도와줄 캐릭터를 골라 주세요.';
  END IF;
  IF r.host_persona=p_persona THEN RETURN; END IF;
  UPDATE public.voice_lounge_rooms SET host_persona=p_persona,topic_suggestions=NULL,topic_suggest_ticket=NULL,
    moderator_requested_at=NULL,moderator_requested_by=NULL,moderator_request_kind=NULL WHERE id=p_room;
END $$;

-- start_voice_lounge_solo(text, text, text), as defined in 20261018000000_voice_lounge_solo_topic.sql
CREATE OR REPLACE FUNCTION public.start_voice_lounge_solo(p_space text,p_nickname text,p_persona text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.voice_lounge_spaces; picked text; persona text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT * INTO s FROM public.voice_lounge_spaces WHERE id=p_space AND open;
  IF NOT FOUND THEN RAISE EXCEPTION '지금은 열려 있지 않은 공간이에요.'; END IF;
  persona:=coalesce(p_persona,s.host_persona);
  IF NOT public.is_lounge_house_character(persona) THEN RAISE EXCEPTION '대화를 도와줄 캐릭터를 골라 주세요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
  SELECT id INTO picked FROM public.voice_lounge_rooms
    WHERE host_id=auth.uid() AND capacity=1 AND space_id IS NULL AND host_persona=persona
      AND status IN ('lobby','active') AND coalesce(expires_at,created_at+interval '2 hours')>now()
    ORDER BY created_at DESC LIMIT 1;
  IF picked IS NOT NULL THEN RETURN picked; END IF;
  RETURN public.create_voice_lounge(persona,'둘이서 편하게 이야기해요',1,p_nickname,s.theme,false);
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
