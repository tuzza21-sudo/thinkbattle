-- Apply after 20261014000000_voice_lounge_detective_space_name.sql.
-- 상상의 집 home shows conversation rooms instead of characters. A place (space) is now only the scenery: whoever
-- opens a room there is its owner (host_id) and chooses the topic and the character who helps the conversation.
-- Visitors see each room's topic, how many people are there and their gender before they sit down.
-- Only the owner changes the topic or the character; when the owner leaves (or has not been seen for a minute) the
-- earliest remaining person becomes the owner. The AI voice is still sent by the lease holder (broadcaster).
-- spaces.host_persona stays as the place's suggested character and the character used for solo play.
BEGIN;

-- Gender of a person, shown as counts on a room. Email signup asks for it; social and guest accounts are asked
-- before they first sit down.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_gender_check;
ALTER TABLE public.users ADD CONSTRAINT users_gender_check CHECK (gender IS NULL OR gender IN ('male','female'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, nickname, provider, gender)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data ->> 'nickname'), ''), NULLIF(trim(NEW.raw_user_meta_data ->> 'name'), ''), split_part(COALESCE(NEW.email, ''), '@', 1), '사용자'),
    COALESCE(NULLIF(NEW.raw_app_meta_data ->> 'provider', ''), 'email'),
    CASE WHEN NEW.raw_user_meta_data ->> 'gender' IN ('male','female') THEN NEW.raw_user_meta_data ->> 'gender' END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nickname = COALESCE(NULLIF(public.users.nickname, ''), EXCLUDED.nickname),
    provider = EXCLUDED.provider,
    gender = COALESCE(public.users.gender, EXCLUDED.gender);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.voice_lounge_require_gender() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND gender IS NOT NULL) THEN
    RAISE EXCEPTION '대화방에 들어가기 전에 성별을 선택해 주세요.';
  END IF;
END $$;

-- Hands a space table to the earliest person still there when its owner left or has not been seen for a minute.
CREATE OR REPLACE FUNCTION public.voice_lounge_pass_owner(p_room text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE next_owner uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM public.voice_lounge_rooms r JOIN public.voice_lounge_members m ON m.room_id=r.id AND m.user_id=r.host_id
      WHERE r.id=p_room AND m.active AND m.last_seen>now()-interval '60 seconds') THEN RETURN; END IF;
  SELECT m.user_id INTO next_owner FROM public.voice_lounge_members m
    WHERE m.room_id=p_room AND m.active AND m.last_seen>now()-interval '60 seconds' ORDER BY m.joined_at, m.user_id LIMIT 1;
  IF next_owner IS NOT NULL THEN
    UPDATE public.voice_lounge_rooms SET host_id=next_owner WHERE id=p_room AND space_id IS NOT NULL AND status='active';
  END IF;
END $$;

-- Same as 20261009000000, and also passes on the tables the user owned and left.
CREATE OR REPLACE FUNCTION public.close_empty_voice_lounge_tables(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE left_room text;
BEGIN
  UPDATE public.voice_lounge_rooms r SET broadcaster_id=NULL,broadcaster_seen_at=NULL
    WHERE r.space_id IS NOT NULL AND r.status='active' AND r.broadcaster_id=p_user
      AND NOT EXISTS(SELECT 1 FROM public.voice_lounge_members m WHERE m.room_id=r.id AND m.user_id=p_user AND m.active);
  UPDATE public.voice_lounge_rooms r SET status='ended'
    WHERE r.space_id IS NOT NULL AND r.status='active'
      AND NOT EXISTS(SELECT 1 FROM public.voice_lounge_members m WHERE m.room_id=r.id AND m.active);
  FOR left_room IN SELECT r.id FROM public.voice_lounge_rooms r WHERE r.space_id IS NOT NULL AND r.status='active' AND r.host_id=p_user
      AND NOT EXISTS(SELECT 1 FROM public.voice_lounge_members m WHERE m.room_id=r.id AND m.user_id=p_user AND m.active) LOOP
    PERFORM public.voice_lounge_pass_owner(left_room);
  END LOOP;
END $$;

-- Same as 20261009000000 except that a space table passes its owner on when the owner leaves or goes quiet.
CREATE OR REPLACE FUNCTION public.control_voice_lounge(p_room text,p_action text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR NOT public.is_voice_lounge_member(p_room) THEN RAISE EXCEPTION '방 참가 권한이 없어요.'; END IF;
  IF p_action='heartbeat' THEN
    UPDATE public.voice_lounge_members SET last_seen=now() WHERE room_id=p_room AND user_id=auth.uid();
    IF coalesce(r.expires_at,r.created_at+interval '2 hours')<=now()
      THEN UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room;
    ELSIF r.space_id IS NOT NULL AND r.status='active' THEN
      UPDATE public.voice_lounge_rooms SET expires_at=greatest(expires_at,now()+interval '30 minutes') WHERE id=p_room;
      PERFORM public.voice_lounge_pass_owner(p_room);
    END IF;
  ELSIF p_action='leave' THEN
    IF r.host_id=auth.uid() AND r.space_id IS NULL THEN UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room; END IF;
    UPDATE public.voice_lounge_members SET active=false WHERE room_id=p_room AND user_id=auth.uid();
    IF r.space_id IS NOT NULL THEN
      UPDATE public.voice_lounge_rooms SET broadcaster_id=NULL,broadcaster_seen_at=NULL WHERE id=p_room AND broadcaster_id=auth.uid();
      IF NOT EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND active) THEN
        UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room;
      ELSE
        PERFORM public.voice_lounge_pass_owner(p_room);
      END IF;
    END IF;
  ELSIF p_action='start' THEN
    IF r.host_id<>auth.uid() OR r.status<>'lobby' OR r.created_at+interval '2 hours'<=now() THEN RAISE EXCEPTION '방장만 유효한 대기방의 대화를 시작할 수 있어요.'; END IF;
    IF (SELECT count(*) FROM public.voice_lounge_members WHERE room_id=p_room AND active) < (CASE WHEN r.capacity=1 THEN 1 ELSE 2 END) THEN
      RAISE EXCEPTION '함께하는 방은 두 명 이상 모이면 시작할 수 있어요. 혼자 대화하려면 1:1 방을 만들어 주세요.';
    END IF;
    UPDATE public.voice_lounge_rooms SET status='active',started_at=now(),expires_at=now()+interval '1 hour' WHERE id=p_room;
  ELSIF p_action='end' THEN
    IF r.host_id<>auth.uid() OR r.space_id IS NOT NULL THEN RAISE EXCEPTION '방장만 종료할 수 있어요.'; END IF;
    UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room;
  ELSE RAISE EXCEPTION '올바르지 않은 요청이에요.';
  END IF;
END $$;

-- Every open room in the house, with its place, character, topic, and who is there (as counts by gender).
CREATE OR REPLACE FUNCTION public.list_voice_lounge_open_tables()
RETURNS TABLE(id text, space_id text, space_name text, theme text, host_persona text, topic text, present_count integer,
  capacity integer, male_count integer, female_count integer, participants text[], owner text, mine boolean)
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
    coalesce(EXISTS(SELECT 1 FROM public.voice_lounge_members m WHERE m.room_id=t.id AND m.user_id=auth.uid() AND m.active),false)
  FROM tables t JOIN public.voice_lounge_spaces s ON s.id=t.space_id
  WHERE t.present>0
  ORDER BY (t.present<t.capacity) DESC, t.present DESC, t.created_at DESC, t.id
  LIMIT 60;
$$;

-- The tables of one place, as above. The return type changes, so the function is dropped first.
DROP FUNCTION IF EXISTS public.list_voice_lounge_space_tables(text);
CREATE FUNCTION public.list_voice_lounge_space_tables(p_space text)
RETURNS TABLE(id text, topic text, present_count integer, capacity integer, participants text[], mine boolean,
  host_persona text, male_count integer, female_count integer, owner text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT t.id, t.topic, t.present_count, t.capacity, t.participants, t.mine, t.host_persona, t.male_count, t.female_count, t.owner
  FROM public.list_voice_lounge_open_tables() t WHERE t.space_id=p_space LIMIT 30;
$$;

-- Sits at a chosen table. Same as 20261009000000, and asks for gender first and passes on tables the visitor left.
CREATE OR REPLACE FUNCTION public.enter_voice_lounge_table(p_room text,p_nickname text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; name text:=left(btrim(coalesce(p_nickname,'')),30);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF name='' THEN RAISE EXCEPTION '닉네임을 확인해 주세요.'; END IF;
  PERFORM public.voice_lounge_require_gender();
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room;
  IF NOT FOUND OR r.space_id IS NULL THEN RAISE EXCEPTION '이 대화방은 지금 열려 있지 않아요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-space:'||r.space_id,96));
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF r.status<>'active' OR r.expires_at<=now() THEN RAISE EXCEPTION '이 대화방은 지금 열려 있지 않아요.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND active) THEN
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

-- Opens a room in a place with the owner's topic and character. Anyone may open one at any time, next to rooms
-- with free seats; the visitor leaves any other table they were at.
DROP FUNCTION IF EXISTS public.open_voice_lounge_table(text,text);
CREATE OR REPLACE FUNCTION public.open_voice_lounge_table(p_space text,p_nickname text,p_topic text,p_persona text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.voice_lounge_spaces; picked text; next_no integer; name text:=left(btrim(coalesce(p_nickname,'')),30);
  body text:=btrim(coalesce(p_topic,''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF name='' THEN RAISE EXCEPTION '닉네임을 확인해 주세요.'; END IF;
  PERFORM public.voice_lounge_require_gender();
  IF length(body) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION '대화 주제는 1~80자로 적어 주세요.'; END IF;
  IF p_persona IS NULL OR p_persona NOT IN ('jaeseok','ina','auditor','closer','velvet','trickster','diplomat','lawyer') THEN
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

-- Only the owner sets the topic, typed or picked from the character's current suggestions.
CREATE OR REPLACE FUNCTION public.set_voice_lounge_topic(p_room text,p_topic text,p_source text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; m public.voice_lounge_members; body text:=btrim(coalesce(p_topic,''));
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  SELECT * INTO m FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND active;
  IF r.id IS NULL OR m.user_id IS NULL OR r.space_id IS NULL OR r.status<>'active' THEN RAISE EXCEPTION '이 대화방의 주제를 바꿀 수 없어요.'; END IF;
  IF r.host_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION '방장만 주제를 바꿀 수 있어요.'; END IF;
  IF m.speaking_restricted_until>now() THEN RAISE EXCEPTION '발언 제한 중에는 주제를 바꿀 수 없어요.'; END IF;
  IF length(body) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION '주제는 1~80자로 적어 주세요.'; END IF;
  IF p_source IS NULL OR p_source NOT IN ('ai','member') THEN RAISE EXCEPTION '올바르지 않은 요청이에요.'; END IF;
  IF p_source='ai' AND NOT coalesce(r.topic_suggestions ? body,false) THEN RAISE EXCEPTION '추천된 주제에서 골라 주세요.'; END IF;
  IF r.topic_set_at>now()-interval '5 seconds' THEN RAISE EXCEPTION '방금 주제가 바뀌었어요. 잠시 뒤에 다시 바꿔 주세요.'; END IF;
  UPDATE public.voice_lounge_rooms SET topic=body,topic_source=p_source,topic_set_by=m.nickname,topic_set_at=now(),topic_suggestions=NULL
    WHERE id=p_room;
END $$;

-- Only the owner changes the character helping the room. Suggestions from the previous character are dropped.
CREATE OR REPLACE FUNCTION public.set_voice_lounge_persona(p_room text,p_persona text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.space_id IS NULL OR r.status<>'active' OR NOT public.is_voice_lounge_member(p_room) THEN RAISE EXCEPTION '이 대화방의 캐릭터를 바꿀 수 없어요.'; END IF;
  IF r.host_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION '방장만 캐릭터를 바꿀 수 있어요.'; END IF;
  IF p_persona IS NULL OR p_persona NOT IN ('jaeseok','ina','auditor','closer','velvet','trickster','diplomat','lawyer') THEN
    RAISE EXCEPTION '대화를 도와줄 캐릭터를 골라 주세요.';
  END IF;
  IF r.host_persona=p_persona THEN RETURN; END IF;
  UPDATE public.voice_lounge_rooms SET host_persona=p_persona,topic_suggestions=NULL,topic_suggest_ticket=NULL,
    moderator_requested_at=NULL,moderator_requested_by=NULL,moderator_request_kind=NULL WHERE id=p_room;
END $$;

-- Topic suggestions are asked for by the owner only (otherwise as in 20261009000000).
CREATE OR REPLACE FUNCTION public.claim_voice_lounge_topic_suggestions(p_room text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; ticket uuid;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.space_id IS NULL OR r.status<>'active' OR NOT public.is_voice_lounge_member(p_room)
    OR r.host_id IS DISTINCT FROM auth.uid() OR r.topic_suggested_at>now()-interval '20 seconds' THEN RETURN NULL; END IF;
  ticket:=gen_random_uuid();
  UPDATE public.voice_lounge_rooms SET topic_suggest_ticket=ticket,topic_suggested_at=now() WHERE id=p_room;
  RETURN jsonb_build_object('ticket',ticket,'host_persona',r.host_persona,
    'space_name',(SELECT name FROM public.voice_lounge_spaces WHERE id=r.space_id),
    'topic',CASE WHEN r.topic_source IS NULL THEN NULL ELSE r.topic END,
    'recent',(SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.id),'[]') FROM (SELECT id,nickname,text FROM public.voice_lounge_messages
      WHERE room_id=p_room ORDER BY id DESC LIMIT 8) x));
END $$;

REVOKE ALL ON FUNCTION public.voice_lounge_require_gender(),public.voice_lounge_pass_owner(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.list_voice_lounge_open_tables(),public.list_voice_lounge_space_tables(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_voice_lounge_open_tables(),public.list_voice_lounge_space_tables(text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.open_voice_lounge_table(text,text,text,text),public.set_voice_lounge_persona(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.open_voice_lounge_table(text,text,text,text),public.set_voice_lounge_persona(text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
