-- Apply after 20261016000000_voice_lounge_han_river_replaces_bar_and_detective.sql.
-- 1) A room's owner can limit it to age groups. People's age group comes later from a profile step (with their
--    introduction and gender, for every kind of account); a person whose age group is unknown is let in, so the limit
--    starts to bind once that step exists. No age groups on a room means no limit.
-- 2) Sitting at a room no longer asks for gender; the gender of people is shown on rooms when it is known.
-- 3) Solo play can be with any character, in any open place's scenery.
BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS age_group text;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_age_group_check;
ALTER TABLE public.users ADD CONSTRAINT users_age_group_check CHECK (age_group IS NULL OR age_group IN ('20s','30s','40s','50s','60s'));
ALTER TABLE public.voice_lounge_rooms ADD COLUMN IF NOT EXISTS age_groups text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.voice_lounge_rooms DROP CONSTRAINT IF EXISTS voice_lounge_rooms_age_groups_check;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_rooms_age_groups_check CHECK (age_groups <@ ARRAY['20s','30s','40s','50s','60s']::text[]);

CREATE OR REPLACE FUNCTION public.voice_lounge_age_allowed(p_ages text[], p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(cardinality(p_ages),0)=0
    OR coalesce((SELECT u.age_group IS NULL OR u.age_group = ANY(p_ages) FROM public.users u WHERE u.id=p_user),true);
$$;

-- Sits at a chosen room: no gender question; a room with an age limit refuses people known to be outside it.
CREATE OR REPLACE FUNCTION public.enter_voice_lounge_table(p_room text,p_nickname text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; name text:=left(btrim(coalesce(p_nickname,'')),30);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF name='' THEN RAISE EXCEPTION '닉네임을 확인해 주세요.'; END IF;
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room;
  IF NOT FOUND OR r.space_id IS NULL THEN RAISE EXCEPTION '이 대화방은 지금 열려 있지 않아요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-space:'||r.space_id,96));
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF r.status<>'active' OR r.expires_at<=now() THEN RAISE EXCEPTION '이 대화방은 지금 열려 있지 않아요.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND active) THEN
    IF NOT public.voice_lounge_age_allowed(r.age_groups,auth.uid()) THEN RAISE EXCEPTION '이 대화방은 정해진 연령대만 들어올 수 있어요.'; END IF;
    IF public.voice_lounge_free_seats(p_room)<=0 THEN RAISE EXCEPTION '이 대화방은 지금 가득 찼어요.'; END IF;
    IF public.voice_lounge_free_seats(p_room)<=public.voice_lounge_waiters_ahead(r.space_id,auth.uid()) THEN
      RAISE EXCEPTION '자리를 기다리는 분이 먼저 앉아요. 대기에 참여해 주세요.';
    END IF;
  END IF;
  UPDATE public.voice_lounge_members m SET active=false FROM public.voice_lounge_rooms o
    WHERE m.room_id=o.id AND m.user_id=auth.uid() AND m.active AND o.space_id IS NOT NULL AND o.id<>p_room;
  INSERT INTO public.voice_lounge_members(room_id,user_id,nickname) VALUES(p_room,auth.uid(),name)
    ON CONFLICT(room_id,user_id) DO UPDATE SET nickname=excluded.nickname,last_seen=now(),active=true;
  UPDATE public.voice_lounge_rooms SET expires_at=greatest(expires_at,now()+interval '30 minutes') WHERE id=p_room;
  DELETE FROM public.voice_lounge_waitlist WHERE user_id=auth.uid();
  PERFORM public.close_empty_voice_lounge_tables(auth.uid());
  RETURN p_room;
END $$;

-- Opens a room with the owner's topic, character and age limit.
DROP FUNCTION IF EXISTS public.open_voice_lounge_table(text,text,text,text);
CREATE OR REPLACE FUNCTION public.open_voice_lounge_table(p_space text,p_nickname text,p_topic text,p_persona text,p_ages text[] DEFAULT '{}') RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.voice_lounge_spaces; picked text; next_no integer; name text:=left(btrim(coalesce(p_nickname,'')),30);
  body text:=btrim(coalesce(p_topic,'')); ages text[]:=coalesce(p_ages,'{}');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF name='' THEN RAISE EXCEPTION '닉네임을 확인해 주세요.'; END IF;
  IF length(body) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION '대화 주제는 1~80자로 적어 주세요.'; END IF;
  IF p_persona IS NULL OR p_persona NOT IN ('jaeseok','ina','auditor','closer','velvet','trickster','diplomat','lawyer') THEN
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

-- The room lists also return each room's age limit. The return type changes, so both are dropped first.
DROP FUNCTION IF EXISTS public.list_voice_lounge_space_tables(text);
DROP FUNCTION IF EXISTS public.list_voice_lounge_open_tables();
CREATE FUNCTION public.list_voice_lounge_open_tables()
RETURNS TABLE(id text, space_id text, space_name text, theme text, host_persona text, topic text, present_count integer,
  capacity integer, male_count integer, female_count integer, participants text[], owner text, mine boolean, age_groups text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH tables AS (
    SELECT r.*, public.voice_lounge_present_count(r.id,interval '60 seconds') AS present
    FROM public.voice_lounge_rooms r JOIN public.voice_lounge_spaces s ON s.id=r.space_id AND s.open
    WHERE r.status='active' AND r.expires_at>now()
  ), people AS (
    SELECT m.room_id, m.nickname, m.user_id, m.joined_at, u.gender FROM public.voice_lounge_members m
      LEFT JOIN public.users u ON u.id=m.user_id
    WHERE m.active AND m.last_seen>now()-interval '60 seconds' AND m.room_id IN (SELECT t.id FROM tables t WHERE t.present>0)
  )
  SELECT t.id, t.space_id, s.name, t.theme, t.host_persona, CASE WHEN t.topic_source IS NULL THEN NULL ELSE t.topic END,
    t.present, t.capacity,
    (SELECT count(*)::integer FROM people p WHERE p.room_id=t.id AND p.gender='male'),
    (SELECT count(*)::integer FROM people p WHERE p.room_id=t.id AND p.gender='female'),
    coalesce((SELECT array_agg(p.nickname ORDER BY p.joined_at) FROM people p WHERE p.room_id=t.id),'{}'),
    (SELECT m.nickname FROM public.voice_lounge_members m WHERE m.room_id=t.id AND m.user_id=t.host_id),
    coalesce(EXISTS(SELECT 1 FROM public.voice_lounge_members m WHERE m.room_id=t.id AND m.user_id=auth.uid() AND m.active),false),
    t.age_groups
  FROM tables t JOIN public.voice_lounge_spaces s ON s.id=t.space_id
  WHERE t.present>0
  ORDER BY (t.present<t.capacity) DESC, t.present DESC, t.created_at DESC, t.id
  LIMIT 60;
$$;
CREATE FUNCTION public.list_voice_lounge_space_tables(p_space text)
RETURNS TABLE(id text, topic text, present_count integer, capacity integer, participants text[], mine boolean,
  host_persona text, male_count integer, female_count integer, owner text, age_groups text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT t.id, t.topic, t.present_count, t.capacity, t.participants, t.mine, t.host_persona, t.male_count, t.female_count, t.owner, t.age_groups
  FROM public.list_voice_lounge_open_tables() t WHERE t.space_id=p_space LIMIT 30;
$$;

-- Solo play with any character: the place only gives the scenery. Without a character it is the place's own.
DROP FUNCTION IF EXISTS public.start_voice_lounge_solo(text,text);
CREATE OR REPLACE FUNCTION public.start_voice_lounge_solo(p_space text,p_nickname text,p_persona text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.voice_lounge_spaces; picked text; persona text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT * INTO s FROM public.voice_lounge_spaces WHERE id=p_space AND open;
  IF NOT FOUND THEN RAISE EXCEPTION '지금은 열려 있지 않은 공간이에요.'; END IF;
  persona:=coalesce(p_persona,s.host_persona);
  IF persona NOT IN ('jaeseok','ina','auditor','closer','velvet','trickster','diplomat','lawyer') THEN RAISE EXCEPTION '대화를 도와줄 캐릭터를 골라 주세요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
  SELECT id INTO picked FROM public.voice_lounge_rooms
    WHERE host_id=auth.uid() AND capacity=1 AND space_id IS NULL AND host_persona=persona
      AND status IN ('lobby','active') AND coalesce(expires_at,created_at+interval '2 hours')>now()
    ORDER BY created_at DESC LIMIT 1;
  IF picked IS NOT NULL THEN RETURN picked; END IF;
  RETURN public.create_voice_lounge(persona,s.name||'에서 둘이서',1,p_nickname,s.theme,false);
END $$;

-- Sitting no longer asks for gender.
DROP FUNCTION IF EXISTS public.voice_lounge_require_gender();

REVOKE ALL ON FUNCTION public.voice_lounge_age_allowed(text[],uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.list_voice_lounge_open_tables(),public.list_voice_lounge_space_tables(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_voice_lounge_open_tables(),public.list_voice_lounge_space_tables(text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.open_voice_lounge_table(text,text,text,text,text[]),public.start_voice_lounge_solo(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.open_voice_lounge_table(text,text,text,text,text[]),public.start_voice_lounge_solo(text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
