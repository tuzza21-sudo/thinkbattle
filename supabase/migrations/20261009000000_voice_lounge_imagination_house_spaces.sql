-- Apply after 20261008020000_voice_lounge_remove_style_examples.sql.
-- 상상의 집: each character hosts one space that is always open. Visitors look at a space's table (its topic and
-- the people at it) and decide to sit down; when every table is full they wait in line or open another table.
-- Nobody owns a table. The AI voice is sent by whichever visitor currently drives the AI (a lease, invisible to
-- people), a person alone talks with the character one-to-one, and two or more get the existing light group role.
-- Relationships build in groups too (from each person's speech, classified in the existing safety review); long-term
-- memory is written only in solo play.
-- Anyone at the table can set the topic, typed or picked from the character's suggestions.
-- Solo play is the existing one-to-one room. Rooms without a space keep every existing rule.
BEGIN;
-- Earlier drafts of this file may already be applied. Their list functions returned fewer columns (a return type
-- CREATE OR REPLACE cannot change), and their automatic seating and join offer bypass the waiting line; remove them.
DROP FUNCTION IF EXISTS public.list_voice_lounge_spaces();
DROP FUNCTION IF EXISTS public.list_voice_lounge_space_tables(text);
DROP FUNCTION IF EXISTS public.enter_voice_lounge_space(text,text);
DROP FUNCTION IF EXISTS public.find_voice_lounge_company(text);
CREATE TABLE IF NOT EXISTS public.voice_lounge_spaces (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{2,40}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  host_persona text NOT NULL CHECK (host_persona IN ('jaeseok','ina','auditor','closer','velvet','trickster')),
  theme text NOT NULL CHECK (theme IN ('rooftop','river','forest','hotel','cafe','seaside')),
  capacity integer NOT NULL DEFAULT 6 CHECK (capacity BETWEEN 2 AND 6),
  sort integer NOT NULL DEFAULT 0,
  open boolean NOT NULL DEFAULT true
);
-- Seeded once. The character or view of a space can be changed later by updating its row; tables opened
-- afterwards use the new values, and re-running this file does not overwrite them.
INSERT INTO public.voice_lounge_spaces(id,name,host_persona,theme,sort) VALUES
  ('hotel-lounge','호텔 라운지','jaeseok','hotel',1),
  ('seaside-bookshop','바다 테라스 서점','ina','seaside',2),
  ('forest-study','숲속 서재','auditor','forest',3),
  ('rooftop-lounge','루프탑 라운지','closer','rooftop',4),
  ('hotel-bar','호텔 바 끝자리','velvet','hotel',5),
  ('rainy-cafe','비 오는 창가 카페','trickster','cafe',6)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.voice_lounge_spaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lounge_spaces_read ON public.voice_lounge_spaces;
CREATE POLICY lounge_spaces_read ON public.voice_lounge_spaces FOR SELECT TO anon,authenticated USING (true);
REVOKE ALL ON public.voice_lounge_spaces FROM anon,authenticated;
GRANT SELECT ON public.voice_lounge_spaces TO anon,authenticated;

ALTER TABLE public.voice_lounge_rooms
  ADD COLUMN IF NOT EXISTS space_id text REFERENCES public.voice_lounge_spaces(id),
  ADD COLUMN IF NOT EXISTS table_no integer,
  ADD COLUMN IF NOT EXISTS broadcaster_id uuid,
  ADD COLUMN IF NOT EXISTS broadcaster_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS topic_source text,
  ADD COLUMN IF NOT EXISTS topic_set_by text,
  ADD COLUMN IF NOT EXISTS topic_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS topic_suggestions jsonb,
  ADD COLUMN IF NOT EXISTS topic_suggested_at timestamptz,
  ADD COLUMN IF NOT EXISTS topic_suggest_ticket uuid;
ALTER TABLE public.voice_lounge_rooms DROP CONSTRAINT IF EXISTS voice_lounge_rooms_topic_source_check;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_rooms_topic_source_check CHECK (topic_source IS NULL OR topic_source IN ('ai','member'));
CREATE INDEX IF NOT EXISTS voice_lounge_rooms_space_idx ON public.voice_lounge_rooms(space_id,status) WHERE space_id IS NOT NULL;

-- People seen within the window (heartbeats every 15 s, the AI-voice lease every 4 s).
CREATE OR REPLACE FUNCTION public.voice_lounge_present_count(p_room text,p_window interval) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT count(*)::integer FROM public.voice_lounge_members WHERE room_id=p_room AND active AND last_seen>now()-p_window;
$$;
-- One person with the character: a one-to-one room, or a space table with one person present (3 minutes, so a
-- phone briefly in the background does not flip the AI between its one-to-one and group roles).
CREATE OR REPLACE FUNCTION public.voice_lounge_is_solo(r public.voice_lounge_rooms) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF r.space_id IS NULL THEN RETURN r.capacity=1; END IF;
  RETURN public.voice_lounge_present_count(r.id,interval '3 minutes')<=1;
END $$;
-- The browser that asks for AI turns and sends the AI voice: the owner of a created room, the lease holder in a space.
CREATE OR REPLACE FUNCTION public.voice_lounge_drives_ai(r public.voice_lounge_rooms,p_user uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF r.space_id IS NULL THEN RETURN r.host_id IS NOT DISTINCT FROM p_user; END IF;
  RETURN r.broadcaster_id IS NOT DISTINCT FROM p_user;
END $$;
-- Long-term memory is written only in one-to-one rooms (solo play), never at a space table, even by someone alone there.
CREATE OR REPLACE FUNCTION public.voice_lounge_one_to_one(r public.voice_lounge_rooms,p_user uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN r.space_id IS NULL AND r.host_id IS NOT DISTINCT FROM p_user AND r.capacity=1;
END $$;
-- Relationship rule: one-to-one rooms as before; at a space table, anyone present there (alone or with others).
CREATE OR REPLACE FUNCTION public.voice_lounge_relationship_allowed(r public.voice_lounge_rooms,p_user uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF r.space_id IS NULL THEN RETURN public.voice_lounge_one_to_one(r,p_user); END IF;
  RETURN r.status='active' AND EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=r.id AND user_id=p_user AND active AND last_seen>now()-interval '3 minutes');
END $$;
REVOKE ALL ON FUNCTION public.voice_lounge_present_count(text,interval),public.voice_lounge_is_solo(public.voice_lounge_rooms),
  public.voice_lounge_drives_ai(public.voice_lounge_rooms,uuid),public.voice_lounge_one_to_one(public.voice_lounge_rooms,uuid),
  public.voice_lounge_relationship_allowed(public.voice_lounge_rooms,uuid) FROM PUBLIC,anon,authenticated;

-- Existing functions, unchanged except where they asked for the room owner or a one-to-one room:

-- the AI turn, its result, and reviews of other people's speech now go to the browser that drives the AI;

-- relationships are saved at space tables (alone or together), long-term memory only when alone with the character.

CREATE OR REPLACE FUNCTION public.claim_voice_lounge_host(p_room text,p_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.voice_lounge_sessions; ticket uuid; live_count integer; last_host bigint; solo boolean;
BEGIN
  IF p_reason IS NULL OR p_reason NOT IN ('opening','followup','silence','requested') THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  SELECT count(*) INTO live_count FROM public.voice_lounge_members WHERE room_id=p_room AND active;
  solo:=coalesce(public.voice_lounge_is_solo(r),false);
  IF r.id IS NULL OR NOT public.voice_lounge_drives_ai(r,auth.uid()) OR NOT public.is_voice_lounge_member(p_room)
    OR r.status<>'active' OR r.expires_at<=now() OR r.ai_turns>=120
    OR r.last_ai_at>now()-(CASE WHEN solo THEN interval '5 seconds' ELSE interval '10 seconds' END)
    OR r.ai_ticket_at>now()-interval '60 seconds'
    OR EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND speaking_restricted_until>now())
    OR live_count<1 THEN RETURN NULL; END IF;
  IF p_reason='followup' AND NOT solo THEN RETURN NULL; END IF;
  IF p_reason='requested' AND NOT solo AND r.moderator_requested_at IS NULL THEN RETURN NULL; END IF;
  IF p_reason='silence' THEN
    -- Never twice into the same silence: people must have spoken since the AI last did.
    IF solo OR r.last_ai_at>now()-interval '120 seconds' THEN RETURN NULL; END IF;
    SELECT max(id) INTO last_host FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='host';
    IF NOT EXISTS(SELECT 1 FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='human' AND id>coalesce(last_host,0))
      OR EXISTS(SELECT 1 FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='human' AND created_at>now()-interval '30 seconds') THEN RETURN NULL; END IF;
  END IF;
  IF r.guided_session THEN
    SELECT * INTO s FROM public.voice_lounge_sessions WHERE room_id=p_room;
    IF NOT FOUND OR s.state NOT IN ('ready','free') THEN RETURN NULL; END IF;
    IF p_reason='opening' AND (s.stage NOT IN (0,1,5) OR s.announced_stage=s.stage) THEN RETURN NULL; END IF;
    IF p_reason='silence' AND s.state<>'free' THEN RETURN NULL; END IF;
  ELSIF NOT solo AND p_reason='opening' AND EXISTS(
    SELECT 1 FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='host') THEN RETURN NULL;
  END IF;
  ticket:=gen_random_uuid();
  UPDATE public.voice_lounge_rooms SET ai_ticket=ticket,ai_ticket_at=now(),last_ai_at=now(),ai_turns=ai_turns+1,
    ai_session_turn=CASE WHEN r.guided_session THEN s.turn_id ELSE NULL END,ai_host_reason=p_reason WHERE id=p_room;
  RETURN ticket;
END $$;

CREATE OR REPLACE FUNCTION public.finish_voice_lounge_host(p_room text,p_ticket uuid,p_text text,p_memory text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.voice_lounge_sessions; answered boolean;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR NOT public.voice_lounge_drives_ai(r,auth.uid()) OR r.ai_ticket IS DISTINCT FROM p_ticket
    OR r.status<>'active' OR r.expires_at<=now() OR r.ai_ticket_at<now()-interval '60 seconds' THEN RETURN false; END IF;
  IF r.guided_session THEN
    SELECT * INTO s FROM public.voice_lounge_sessions WHERE room_id=p_room FOR UPDATE;
    IF NOT FOUND OR s.turn_id IS DISTINCT FROM r.ai_session_turn OR s.state NOT IN ('ready','free') THEN
      UPDATE public.voice_lounge_rooms SET ai_ticket=NULL,ai_ticket_at=NULL,ai_host_reason=NULL WHERE id=p_room;
      RETURN false;
    END IF;
  END IF;
  IF length(trim(p_text)) NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'invalid host response'; END IF;
  answered:=r.ai_host_reason='requested' AND r.moderator_requested_at<=r.ai_ticket_at;
  INSERT INTO public.voice_lounge_messages(room_id,nickname,kind,text) VALUES(p_room,'AI 사회자','host',trim(p_text));
  UPDATE public.voice_lounge_rooms SET memory=left(p_memory,1800),ai_ticket=NULL,ai_ticket_at=NULL,ai_host_reason=NULL,
    moderator_requested_at=CASE WHEN answered THEN NULL ELSE moderator_requested_at END,
    moderator_requested_by=CASE WHEN answered THEN NULL ELSE moderator_requested_by END,
    moderator_request_kind=CASE WHEN answered THEN NULL ELSE moderator_request_kind END WHERE id=p_room;
  IF r.guided_session AND r.ai_host_reason='opening' THEN
    UPDATE public.voice_lounge_sessions SET announced_turn=s.turn_id,announced_stage=s.stage,updated_at=clock_timestamp() WHERE room_id=p_room;
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.claim_voice_lounge_interaction(p_room text,p_actor uuid,p_message bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; m public.voice_lounge_messages; ticket uuid;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.status<>'active' OR r.expires_at<=now()
    OR NOT EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=p_actor AND active) THEN RETURN NULL; END IF;
  SELECT * INTO m FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='human'
    AND reviewed_at IS NULL AND review_attempts<3 AND created_at>now()-interval '2 minutes'
    AND (p_message IS NULL OR id=p_message)
    AND (user_id=p_actor OR (p_message IS NOT NULL AND public.voice_lounge_drives_ai(r,p_actor)))
    AND (review_ticket_at IS NULL OR review_ticket_at<now()-interval '30 seconds') ORDER BY id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  ticket:=gen_random_uuid();
  UPDATE public.voice_lounge_messages SET review_ticket=ticket,review_ticket_at=now(),review_attempts=review_attempts+1 WHERE id=m.id;
  RETURN jsonb_build_object('ticket',ticket,'message_id',m.id,'text',m.text,'speaker_id',m.user_id,'turn_id',m.turn_id,'topic',r.topic,'host_persona',r.host_persona,'group',r.space_id IS NOT NULL AND NOT public.voice_lounge_is_solo(r),
    'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',user_id,'nickname',nickname)),'[]') FROM public.voice_lounge_members
      WHERE room_id=p_room AND active AND last_seen>now()-interval '90 seconds'),
    'recent',(SELECT coalesce(jsonb_agg(row_to_json(x)),'[]') FROM (SELECT nickname,text FROM public.voice_lounge_messages
      WHERE room_id=p_room AND id<m.id AND kind='human' ORDER BY id DESC LIMIT 4) x));
END $$;

CREATE OR REPLACE FUNCTION public.save_voice_lounge_relationship(
  p_user uuid, p_character text, p_room text, p_expected_version integer, p_state jsonb, p_mood jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; saved integer; item record;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room;
  IF NOT FOUND OR NOT public.voice_lounge_relationship_allowed(r,p_user) OR r.host_persona IS DISTINCT FROM p_character THEN RETURN NULL; END IF;
  IF p_expected_version IS NULL OR p_expected_version<0 OR jsonb_typeof(p_state) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_state->'scores') IS DISTINCT FROM 'object' OR jsonb_typeof(p_state->'stage') IS DISTINCT FROM 'string' OR jsonb_typeof(p_state->'pending') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_state->'recentEvents') IS DISTINCT FROM 'array' OR jsonb_typeof(p_state->'memories') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_state->'turnCount') IS DISTINCT FROM 'number' OR jsonb_typeof(p_state->'meaningfulTurns') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'invalid relationship state';
  END IF;
  FOR item IN SELECT * FROM jsonb_each(p_state->'scores') LOOP
    IF jsonb_typeof(item.value) IS DISTINCT FROM 'number' OR (item.value#>>'{}')::numeric NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'invalid relationship score'; END IF;
  END LOOP;
  IF p_expected_version=0 THEN
    INSERT INTO public.voice_lounge_relationships(user_id,character_id,scores,stage,pending,recent_events,memories,meaningful_turns,turn_count,last_interaction_at)
      VALUES(p_user,p_character,p_state->'scores',p_state->>'stage',p_state->'pending',p_state->'recentEvents',p_state->'memories',
        (p_state->>'meaningfulTurns')::integer,(p_state->>'turnCount')::integer,(p_state->>'lastInteractionAt')::timestamptz)
      ON CONFLICT (user_id,character_id) DO NOTHING RETURNING version INTO saved;
  ELSE
    UPDATE public.voice_lounge_relationships SET scores=p_state->'scores',stage=p_state->>'stage',pending=p_state->'pending',
      recent_events=p_state->'recentEvents',memories=p_state->'memories',meaningful_turns=(p_state->>'meaningfulTurns')::integer,
      turn_count=(p_state->>'turnCount')::integer,last_interaction_at=(p_state->>'lastInteractionAt')::timestamptz,
      version=version+1,updated_at=now()
      WHERE user_id=p_user AND character_id=p_character AND version=p_expected_version RETURNING version INTO saved;
  END IF;
  IF saved IS NOT NULL AND jsonb_typeof(p_mood)='object' THEN UPDATE public.voice_lounge_rooms SET ai_mood=p_mood WHERE id=p_room; END IF;
  RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION public.apply_voice_lounge_memory_ops(p_user uuid, p_character text, p_room text, p_ops jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; op jsonb; target public.voice_lounge_memories; new_id uuid; applied integer := 0;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room;
  IF NOT FOUND OR NOT public.voice_lounge_one_to_one(r,p_user) OR r.host_persona IS DISTINCT FROM p_character THEN RETURN NULL; END IF;
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

-- Same as 20261005000000 except: space tables never end because someone leaves, close when the last person

-- leaves, and stay open while people keep coming (rolling 30-minute expiry).

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
    -- A space table stays open while someone is there.
    ELSIF r.space_id IS NOT NULL AND r.status='active'
      THEN UPDATE public.voice_lounge_rooms SET expires_at=greatest(expires_at,now()+interval '30 minutes') WHERE id=p_room; END IF;
  ELSIF p_action='leave' THEN
    IF r.host_id=auth.uid() AND r.space_id IS NULL THEN UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room; END IF;
    UPDATE public.voice_lounge_members SET active=false WHERE room_id=p_room AND user_id=auth.uid();
    -- In a space nobody owns the table: it closes when the last person leaves, and the AI voice moves on.
    IF r.space_id IS NOT NULL THEN
      UPDATE public.voice_lounge_rooms SET broadcaster_id=NULL,broadcaster_seen_at=NULL WHERE id=p_room AND broadcaster_id=auth.uid();
      IF NOT EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND active) THEN
        UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=p_room;
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

-- Space tables are reached through their space, not the open-room list.

CREATE OR REPLACE FUNCTION public.list_open_voice_lounges()
RETURNS TABLE(id text, topic text, host_persona text, theme text, capacity integer,
  status text, participant_count integer, topic_brief jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.topic, r.host_persona, r.theme, r.capacity, r.status,
    (SELECT count(*)::integer FROM public.voice_lounge_members m
      WHERE m.room_id = r.id AND m.active), r.topic_brief
  FROM public.voice_lounge_rooms r
  WHERE r.capacity > 1 AND r.status IN ('lobby', 'active') AND r.space_id IS NULL
    AND coalesce(r.expires_at, r.created_at + interval '2 hours') > now()
    AND EXISTS (SELECT 1 FROM public.voice_lounge_members h WHERE h.room_id = r.id
      AND h.user_id = r.host_id AND h.active)
  ORDER BY (r.status = 'lobby') DESC, r.created_at DESC, r.id
  LIMIT 60;
$$;

-- Ends space tables nobody is at any more, and frees the AI voice of someone who moved away.
CREATE OR REPLACE FUNCTION public.close_empty_voice_lounge_tables(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.voice_lounge_rooms r SET broadcaster_id=NULL,broadcaster_seen_at=NULL
    WHERE r.space_id IS NOT NULL AND r.status='active' AND r.broadcaster_id=p_user
      AND NOT EXISTS(SELECT 1 FROM public.voice_lounge_members m WHERE m.room_id=r.id AND m.user_id=p_user AND m.active);
  UPDATE public.voice_lounge_rooms r SET status='ended'
    WHERE r.space_id IS NOT NULL AND r.status='active'
      AND NOT EXISTS(SELECT 1 FROM public.voice_lounge_members m WHERE m.room_id=r.id AND m.active);
END $$;
-- Tables nobody has visited for 10 minutes, or past their expiry, are over.
CREATE OR REPLACE FUNCTION public.tidy_voice_lounge_space(p_space text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.voice_lounge_rooms SET status='ended' WHERE space_id=p_space AND status='active'
    AND (expires_at<=now() OR public.voice_lounge_present_count(id,interval '10 minutes')=0);
END $$;

-- People waiting for a seat in a full space, first come first served. While the visitor is anywhere in the house
-- their browser checks in every few seconds; someone who has not checked in for 90 seconds no longer holds a place.
CREATE TABLE IF NOT EXISTS public.voice_lounge_waitlist (
  space_id text NOT NULL REFERENCES public.voice_lounge_spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(space_id,user_id)
);
ALTER TABLE public.voice_lounge_waitlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.voice_lounge_waitlist FROM anon,authenticated;
-- How many people are ahead of this user in line (all live waiters when the user is not waiting).
CREATE OR REPLACE FUNCTION public.voice_lounge_waiters_ahead(p_space text,p_user uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT count(*)::integer FROM public.voice_lounge_waitlist w
  WHERE w.space_id=p_space AND w.user_id<>p_user AND w.last_seen>now()-interval '90 seconds'
    AND w.created_at<coalesce((SELECT created_at FROM public.voice_lounge_waitlist WHERE space_id=p_space AND user_id=p_user AND last_seen>now()-interval '90 seconds'),'infinity');
$$;
CREATE OR REPLACE FUNCTION public.voice_lounge_free_seats(p_room text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.capacity-(SELECT count(*)::integer FROM public.voice_lounge_members WHERE room_id=r.id AND active)
  FROM public.voice_lounge_rooms r WHERE r.id=p_room;
$$;

-- The house: each space, its character, the busiest table's topic and people, and whether a seat is free.
CREATE OR REPLACE FUNCTION public.list_voice_lounge_spaces()
RETURNS TABLE(id text, name text, host_persona text, theme text, capacity integer, present_count integer,
  table_count integer, topic text, participants text[], seat_free boolean, waiting integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH tables AS (
    SELECT r.*, public.voice_lounge_present_count(r.id,interval '60 seconds') AS present
    FROM public.voice_lounge_rooms r WHERE r.space_id IS NOT NULL AND r.status='active' AND r.expires_at>now()
  ), busiest AS (
    SELECT DISTINCT ON (space_id) space_id, id, topic, topic_source FROM tables WHERE present>0 ORDER BY space_id, present DESC, created_at
  )
  SELECT s.id, s.name, s.host_persona, s.theme, s.capacity,
    coalesce((SELECT sum(t.present)::integer FROM tables t WHERE t.space_id=s.id),0),
    (SELECT count(*)::integer FROM tables t WHERE t.space_id=s.id AND t.present>0),
    (SELECT CASE WHEN b.topic_source IS NULL THEN NULL ELSE b.topic END FROM busiest b WHERE b.space_id=s.id),
    coalesce((SELECT array_agg(m.nickname ORDER BY m.joined_at) FROM busiest b JOIN public.voice_lounge_members m ON m.room_id=b.id
      WHERE b.space_id=s.id AND m.active AND m.last_seen>now()-interval '60 seconds'),'{}'),
    NOT EXISTS(SELECT 1 FROM tables t WHERE t.space_id=s.id AND t.present>0)
      OR EXISTS(SELECT 1 FROM tables t WHERE t.space_id=s.id AND t.present>0 AND public.voice_lounge_free_seats(t.id)>0),
    (SELECT count(*)::integer FROM public.voice_lounge_waitlist w WHERE w.space_id=s.id AND w.last_seen>now()-interval '90 seconds')
  FROM public.voice_lounge_spaces s WHERE s.open ORDER BY s.sort, s.id;
$$;

-- The tables of a space with their topic and the people at them, so visitors decide where to sit.
CREATE OR REPLACE FUNCTION public.list_voice_lounge_space_tables(p_space text)
RETURNS TABLE(id text, topic text, present_count integer, capacity integer, participants text[], mine boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.id, CASE WHEN r.topic_source IS NULL THEN NULL ELSE r.topic END,
    public.voice_lounge_present_count(r.id,interval '60 seconds'), r.capacity,
    coalesce((SELECT array_agg(m.nickname ORDER BY m.joined_at) FROM public.voice_lounge_members m
      WHERE m.room_id=r.id AND m.active AND m.last_seen>now()-interval '60 seconds'),'{}'),
    coalesce(EXISTS(SELECT 1 FROM public.voice_lounge_members m WHERE m.room_id=r.id AND m.user_id=auth.uid() AND m.active),false)
  FROM public.voice_lounge_rooms r
  WHERE r.space_id=p_space AND r.status='active' AND r.expires_at>now()
    AND public.voice_lounge_present_count(r.id,interval '60 seconds')>0
  ORDER BY 3 DESC, r.created_at, r.id LIMIT 30;
$$;

-- Sits at a chosen table. Under the space lock: never more than six, and people waiting in line get free seats first.
CREATE OR REPLACE FUNCTION public.enter_voice_lounge_table(p_room text,p_nickname text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; name text:=left(btrim(coalesce(p_nickname,'')),30);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF name='' THEN RAISE EXCEPTION '닉네임을 확인해 주세요.'; END IF;
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room;
  IF NOT FOUND OR r.space_id IS NULL THEN RAISE EXCEPTION '이 테이블은 지금 열려 있지 않아요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-space:'||r.space_id,96));
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF r.status<>'active' OR r.expires_at<=now() THEN RAISE EXCEPTION '이 테이블은 지금 열려 있지 않아요.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND active) THEN
    IF public.voice_lounge_free_seats(p_room)<=0 THEN RAISE EXCEPTION '이 테이블은 지금 가득 찼어요.'; END IF;
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

-- Opens a table in a space: the first one when nobody is there, or another one when every table is full and the
-- visitor chose a new table over waiting. With a free seat anywhere, the visitor is asked to pick that table instead.
CREATE OR REPLACE FUNCTION public.open_voice_lounge_table(p_space text,p_nickname text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.voice_lounge_spaces; picked text; next_no integer; name text:=left(btrim(coalesce(p_nickname,'')),30);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF name='' THEN RAISE EXCEPTION '닉네임을 확인해 주세요.'; END IF;
  SELECT * INTO s FROM public.voice_lounge_spaces WHERE id=p_space AND open;
  IF NOT FOUND THEN RAISE EXCEPTION '지금은 열려 있지 않은 공간이에요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-space:'||p_space,96));
  PERFORM public.tidy_voice_lounge_space(p_space);
  -- Already at a table here: back to it.
  SELECT r.id INTO picked FROM public.voice_lounge_rooms r JOIN public.voice_lounge_members m ON m.room_id=r.id
    WHERE r.space_id=p_space AND r.status='active' AND m.user_id=auth.uid() AND m.active ORDER BY m.last_seen DESC LIMIT 1;
  IF picked IS NOT NULL THEN RETURN picked; END IF;
  IF EXISTS(SELECT 1 FROM public.voice_lounge_rooms r WHERE r.space_id=p_space AND r.status='active'
      AND public.voice_lounge_present_count(r.id,interval '60 seconds')>0 AND public.voice_lounge_free_seats(r.id)>0) THEN
    RAISE EXCEPTION '빈자리가 있는 테이블이 있어요. 테이블을 다시 확인해 주세요.';
  END IF;
  SELECT min(n) INTO next_no FROM generate_series(1,999) n
    WHERE NOT EXISTS(SELECT 1 FROM public.voice_lounge_rooms WHERE space_id=p_space AND status='active' AND table_no=n);
  INSERT INTO public.voice_lounge_rooms(host_id,host_persona,topic,capacity,status,started_at,expires_at,theme,space_id,table_no,guided_session,study_required)
    VALUES(auth.uid(),s.host_persona,'자유 대화',s.capacity,'active',now(),now()+interval '30 minutes',s.theme,p_space,next_no,false,false)
    RETURNING id INTO picked;
  UPDATE public.voice_lounge_members m SET active=false FROM public.voice_lounge_rooms o
    WHERE m.room_id=o.id AND m.user_id=auth.uid() AND m.active AND o.space_id IS NOT NULL AND o.id<>picked;
  INSERT INTO public.voice_lounge_members(room_id,user_id,nickname) VALUES(picked,auth.uid(),name);
  DELETE FROM public.voice_lounge_waitlist WHERE user_id=auth.uid();
  PERFORM public.close_empty_voice_lounge_tables(auth.uid());
  RETURN picked;
END $$;

-- Waiting for a seat. Each check-in keeps the visitor's place and returns it; once enough seats are free for
-- everyone ahead, it also returns a table with a free seat for the client to sit at.
CREATE OR REPLACE FUNCTION public.wait_voice_lounge_space(p_space text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ahead integer; seat text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.voice_lounge_spaces WHERE id=p_space AND open) THEN RAISE EXCEPTION '지금은 열려 있지 않은 공간이에요.'; END IF;
  PERFORM public.tidy_voice_lounge_space(p_space);
  INSERT INTO public.voice_lounge_waitlist(space_id,user_id) VALUES(p_space,auth.uid())
    ON CONFLICT(space_id,user_id) DO UPDATE SET last_seen=now(),
      created_at=CASE WHEN public.voice_lounge_waitlist.last_seen<now()-interval '90 seconds' THEN now() ELSE public.voice_lounge_waitlist.created_at END;
  ahead:=public.voice_lounge_waiters_ahead(p_space,auth.uid());
  SELECT r.id INTO seat FROM public.voice_lounge_rooms r
    WHERE r.space_id=p_space AND r.status='active' AND r.expires_at>now() AND public.voice_lounge_free_seats(r.id)>ahead
    ORDER BY public.voice_lounge_present_count(r.id,interval '60 seconds') DESC, r.created_at LIMIT 1;
  RETURN jsonb_build_object('ahead',ahead,'room',seat);
END $$;
CREATE OR REPLACE FUNCTION public.leave_voice_lounge_wait(p_space text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  DELETE FROM public.voice_lounge_waitlist WHERE space_id=p_space AND user_id=auth.uid();
$$;

-- Every visitor's browser calls this every few seconds and gets back who sends the AI voice. The holder keeps it
-- while it calls; if it stops for 12 seconds, leaves, or is restricted, the next caller takes over.
CREATE OR REPLACE FUNCTION public.claim_voice_lounge_broadcaster(p_room text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.space_id IS NULL OR r.status<>'active' OR NOT public.is_voice_lounge_member(p_room) THEN RETURN NULL; END IF;
  UPDATE public.voice_lounge_members SET last_seen=now() WHERE room_id=p_room AND user_id=auth.uid();
  IF r.broadcaster_id=auth.uid() THEN
    UPDATE public.voice_lounge_rooms SET broadcaster_seen_at=now() WHERE id=p_room;
    RETURN auth.uid();
  END IF;
  IF (r.broadcaster_id IS NULL OR r.broadcaster_seen_at<now()-interval '12 seconds'
      OR NOT EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=r.broadcaster_id AND active
        AND (speaking_restricted_until IS NULL OR speaking_restricted_until<=now())))
    AND NOT EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND speaking_restricted_until>now()) THEN
    UPDATE public.voice_lounge_rooms SET broadcaster_id=auth.uid(),broadcaster_seen_at=now(),ai_ticket=NULL,ai_ticket_at=NULL WHERE id=p_room;
    RETURN auth.uid();
  END IF;
  RETURN r.broadcaster_id;
END $$;

-- Anyone at the table sets the topic: typed by a person, or picked from the character's current suggestions.
CREATE OR REPLACE FUNCTION public.set_voice_lounge_topic(p_room text,p_topic text,p_source text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; m public.voice_lounge_members; body text:=btrim(coalesce(p_topic,''));
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  SELECT * INTO m FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND active;
  IF r.id IS NULL OR m.user_id IS NULL OR r.space_id IS NULL OR r.status<>'active' THEN RAISE EXCEPTION '이 테이블의 주제를 바꿀 수 없어요.'; END IF;
  IF m.speaking_restricted_until>now() THEN RAISE EXCEPTION '발언 제한 중에는 주제를 바꿀 수 없어요.'; END IF;
  IF length(body) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION '주제는 1~80자로 적어 주세요.'; END IF;
  IF p_source IS NULL OR p_source NOT IN ('ai','member') THEN RAISE EXCEPTION '올바르지 않은 요청이에요.'; END IF;
  IF p_source='ai' AND NOT coalesce(r.topic_suggestions ? body,false) THEN RAISE EXCEPTION '추천된 주제에서 골라 주세요.'; END IF;
  IF r.topic_set_at>now()-interval '5 seconds' THEN RAISE EXCEPTION '방금 주제가 바뀌었어요. 잠시 뒤에 다시 바꿔 주세요.'; END IF;
  UPDATE public.voice_lounge_rooms SET topic=body,topic_source=p_source,topic_set_by=m.nickname,topic_set_at=now(),topic_suggestions=NULL
    WHERE id=p_room;
END $$;

-- Topic suggestions from the character: claimed (at most every 20 seconds per table), written by the server, shown to everyone.
CREATE OR REPLACE FUNCTION public.claim_voice_lounge_topic_suggestions(p_room text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; ticket uuid;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.space_id IS NULL OR r.status<>'active' OR NOT public.is_voice_lounge_member(p_room)
    OR r.topic_suggested_at>now()-interval '20 seconds' THEN RETURN NULL; END IF;
  ticket:=gen_random_uuid();
  UPDATE public.voice_lounge_rooms SET topic_suggest_ticket=ticket,topic_suggested_at=now() WHERE id=p_room;
  RETURN jsonb_build_object('ticket',ticket,'host_persona',r.host_persona,
    'space_name',(SELECT name FROM public.voice_lounge_spaces WHERE id=r.space_id),
    'topic',CASE WHEN r.topic_source IS NULL THEN NULL ELSE r.topic END,
    'recent',(SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.id),'[]') FROM (SELECT id,nickname,text FROM public.voice_lounge_messages
      WHERE room_id=p_room ORDER BY id DESC LIMIT 8) x));
END $$;
CREATE OR REPLACE FUNCTION public.finish_voice_lounge_topic_suggestions(p_room text,p_ticket uuid,p_topics jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.topic_suggest_ticket IS DISTINCT FROM p_ticket OR r.topic_suggested_at<now()-interval '60 seconds'
    OR NOT public.is_voice_lounge_member(p_room) THEN RETURN false; END IF;
  IF jsonb_typeof(p_topics) IS DISTINCT FROM 'array' OR jsonb_array_length(p_topics) NOT BETWEEN 1 AND 3
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_topics) t WHERE jsonb_typeof(t) IS DISTINCT FROM 'string' OR length(btrim(t#>>'{}')) NOT BETWEEN 1 AND 80) THEN
    RAISE EXCEPTION 'invalid topic suggestions';
  END IF;
  UPDATE public.voice_lounge_rooms SET topic_suggestions=(SELECT jsonb_agg(btrim(t#>>'{}')) FROM jsonb_array_elements(p_topics) t),topic_suggest_ticket=NULL
    WHERE id=p_room;
  RETURN true;
END $$;

-- Solo play: a private one-to-one with the space's character, using the existing one-to-one room type (relationship
-- and memory as before). An unfinished one with the same character is continued instead of opening another.
CREATE OR REPLACE FUNCTION public.start_voice_lounge_solo(p_space text,p_nickname text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.voice_lounge_spaces; picked text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT * INTO s FROM public.voice_lounge_spaces WHERE id=p_space AND open;
  IF NOT FOUND THEN RAISE EXCEPTION '지금은 열려 있지 않은 공간이에요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
  SELECT id INTO picked FROM public.voice_lounge_rooms
    WHERE host_id=auth.uid() AND capacity=1 AND space_id IS NULL AND host_persona=s.host_persona
      AND status IN ('lobby','active') AND coalesce(expires_at,created_at+interval '2 hours')>now()
    ORDER BY created_at DESC LIMIT 1;
  IF picked IS NOT NULL THEN RETURN picked; END IF;
  RETURN public.create_voice_lounge(s.host_persona,s.name||'에서 둘이서',1,p_nickname,s.theme,false);
END $$;

REVOKE ALL ON FUNCTION public.list_voice_lounge_spaces(),public.list_voice_lounge_space_tables(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_voice_lounge_spaces(),public.list_voice_lounge_space_tables(text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.close_empty_voice_lounge_tables(uuid),public.tidy_voice_lounge_space(text),
  public.voice_lounge_waiters_ahead(text,uuid),public.voice_lounge_free_seats(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enter_voice_lounge_table(text,text),public.open_voice_lounge_table(text,text),
  public.wait_voice_lounge_space(text),public.leave_voice_lounge_wait(text),public.start_voice_lounge_solo(text,text),
  public.claim_voice_lounge_broadcaster(text),public.set_voice_lounge_topic(text,text,text),
  public.claim_voice_lounge_topic_suggestions(text),public.finish_voice_lounge_topic_suggestions(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.enter_voice_lounge_table(text,text),public.open_voice_lounge_table(text,text),
  public.wait_voice_lounge_space(text),public.leave_voice_lounge_wait(text),public.start_voice_lounge_solo(text,text),
  public.claim_voice_lounge_broadcaster(text),public.set_voice_lounge_topic(text,text,text),
  public.claim_voice_lounge_topic_suggestions(text),public.finish_voice_lounge_topic_suggestions(text,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
