-- One-to-one conversations work like a messenger (2026-10-23): every character a member has talked with stays in their
-- chat list, and opening it continues the same conversation (its messages, its summary, its story) instead of starting
-- over. A conversation that was left or ran out of time is opened again; a very long one goes on in a new room that
-- carries its story and summary. Leaving no longer ends a one-to-one conversation (the page just goes back).
-- Rooms are still deleted 30 days after they were last open (cleanup_voice_lounges), as the privacy policy says, so a
-- conversation untouched for a month leaves the list.
BEGIN;

-- Opens a member's own one-to-one conversation to go on with it, and returns the room to open (the same one, or for a
-- conversation near the turn limit, a new one that carries it on). It opens as a chat; the call is started from there.
CREATE OR REPLACE FUNCTION public.resume_lounge_chat(p_room text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; nick text; picked text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room AND host_id=auth.uid() AND capacity=1 AND space_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '이어갈 수 없는 대화예요.'; END IF;
  SELECT nickname INTO nick FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid();
  -- Still open: it stays open a while longer.
  IF r.status IN ('lobby','active') AND coalesce(r.expires_at,r.created_at+interval '2 hours')>now() THEN
    IF r.status='active' THEN UPDATE public.voice_lounge_rooms SET expires_at=greatest(expires_at,now()+interval '30 minutes') WHERE id=p_room; END IF;
    UPDATE public.voice_lounge_members SET active=true,last_seen=now() WHERE room_id=p_room AND user_id=auth.uid();
    RETURN p_room;
  END IF;
  -- Near the turn limit (claim_voice_lounge_host stops at 120): a new room carries the story and what happened so far.
  IF coalesce(r.ai_turns,0)>=110 THEN
    picked:=public.create_voice_lounge(r.host_persona,r.topic,1,coalesce(nick,'나'),coalesce(r.theme,'rooftop'));
    UPDATE public.voice_lounge_rooms SET scenario=r.scenario,memory=r.memory,ai_model=r.ai_model,voice_on=false WHERE id=picked AND host_id=auth.uid();
    RETURN picked;
  END IF;
  UPDATE public.voice_lounge_rooms SET status='active',started_at=coalesce(started_at,now()),expires_at=now()+interval '1 hour',voice_on=false,
    ai_ticket=NULL,ai_ticket_at=NULL,ai_host_reason=NULL WHERE id=p_room;
  UPDATE public.voice_lounge_members SET active=true,last_seen=now() WHERE room_id=p_room AND user_id=auth.uid();
  RETURN p_room;
END $$;

-- A member's chat list: for each character they have said something to, their latest one-to-one conversation with it
-- and its last message, newest first. A member's own or public character comes with its name and portrait.
CREATE OR REPLACE FUNCTION public.list_my_lounge_chats() RETURNS TABLE(
  room_id text, character_id text, story text, last_text text, last_kind text, last_at timestamptz, open boolean,
  character_name text, character_portrait text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM (
    SELECT DISTINCT ON (r.host_persona) r.id, r.host_persona, r.scenario->>'title', last.text, last.kind, coalesce(last.created_at,r.created_at),
      r.status IN ('lobby','active') AND coalesce(r.expires_at,r.created_at+interval '2 hours')>now(),
      c.name, c.portrait_path
    FROM public.voice_lounge_rooms r
    JOIN LATERAL (SELECT m.text, m.kind, m.created_at FROM public.voice_lounge_messages m WHERE m.room_id=r.id ORDER BY m.id DESC LIMIT 1) last ON true
    LEFT JOIN public.lounge_custom_characters c ON c.id=r.host_persona AND (c.owner_id=auth.uid() OR c.status='public')
    WHERE r.host_id=auth.uid() AND r.capacity=1 AND r.space_id IS NULL
      AND EXISTS (SELECT 1 FROM public.voice_lounge_messages h WHERE h.room_id=r.id AND h.kind='human')
    ORDER BY r.host_persona, coalesce(last.created_at,r.created_at) DESC
  ) chats ORDER BY 6 DESC LIMIT 100
$$;

-- Same as 20261108000000, except that a story already begun is carried on (resume_lounge_chat) even after it was left
-- or ran out of time, instead of starting over.
CREATE OR REPLACE FUNCTION public.start_lounge_scenario(p_scenario text, p_nickname text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.lounge_scenarios; picked text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT * INTO s FROM public.lounge_scenarios WHERE id=p_scenario AND active;
  IF NOT FOUND THEN RAISE EXCEPTION '지금은 시작할 수 없는 이야기예요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
  SELECT id INTO picked FROM public.voice_lounge_rooms
    WHERE host_id=auth.uid() AND capacity=1 AND space_id IS NULL AND host_persona=s.character_id AND scenario->>'id'=s.id
    ORDER BY created_at DESC LIMIT 1;
  IF picked IS NOT NULL THEN RETURN public.resume_lounge_chat(picked); END IF;
  picked := public.create_voice_lounge(s.character_id, s.title, 1, p_nickname, s.theme);
  UPDATE public.voice_lounge_rooms SET scenario=jsonb_build_object('id',s.id,'title',s.title,'prologue',s.prologue,'user_role',s.user_role,
    'relationship',s.relationship,'place',s.place) WHERE id=picked AND host_id=auth.uid();
  RETURN picked;
END $$;

-- Same as 20261102000000, except that the conversation with a member's character is carried on in the same way.
CREATE OR REPLACE FUNCTION public.start_lounge_custom_chat(p_character text, p_nickname text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.lounge_custom_characters; picked text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT * INTO c FROM public.lounge_custom_characters WHERE id=p_character;
  IF NOT FOUND OR NOT (c.owner_id=auth.uid() OR c.status='public') THEN RAISE EXCEPTION '대화할 수 없는 캐릭터예요.'; END IF;
  IF c.portrait_path IS NULL THEN RAISE EXCEPTION '대표 사진을 정한 뒤 대화할 수 있어요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
  SELECT id INTO picked FROM public.voice_lounge_rooms
    WHERE host_id=auth.uid() AND capacity=1 AND space_id IS NULL AND host_persona=p_character
    ORDER BY created_at DESC LIMIT 1;
  IF picked IS NOT NULL THEN RETURN public.resume_lounge_chat(picked); END IF;
  RETURN public.create_voice_lounge(p_character,'둘이서 편하게 이야기해요',1,p_nickname,c.theme);
END $$;

REVOKE ALL ON FUNCTION public.resume_lounge_chat(text), public.list_my_lounge_chats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resume_lounge_chat(text), public.list_my_lounge_chats() TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
