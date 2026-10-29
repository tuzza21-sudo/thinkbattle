-- Apply after 20261126000000_lounge_story_episodes.sql.
-- (2026-10-29) A long one-to-one conversation goes on in a new room (a room takes at most 120 replies). That new room
-- lost where the story stood and every message: a member in 선우령's 《검은 장미》 came back to the first episode with
-- none of its checkpoints met and an empty chat. Now:
--   - the new room keeps the story's progress (story_state), the chosen background and the last 40 messages;
--   - it is made from 110 replies on even while the room is still open, so the page can move on before the 120th
--     reply is refused (the character went silent there until the room expired).
BEGIN;

-- resume_lounge_chat(text), as defined in 20261112000000_lounge_chat_list.sql, with the above.
CREATE OR REPLACE FUNCTION public.resume_lounge_chat(p_room text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; nick text; picked text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room AND host_id=auth.uid() AND capacity=1 AND space_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '이어갈 수 없는 대화예요.'; END IF;
  SELECT nickname INTO nick FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid();
  -- Near the turn limit (claim_voice_lounge_host stops at 120): a new room carries the story, where it stands, and the
  -- latest messages. The old room ends; opened again from the chat list, it leads to the room that carried it on.
  IF coalesce(r.ai_turns,0)>=110 THEN
    SELECT id INTO picked FROM public.voice_lounge_rooms
      WHERE host_id=auth.uid() AND capacity=1 AND space_id IS NULL AND host_persona=r.host_persona AND created_at>r.created_at
        AND scenario->>'id' IS NOT DISTINCT FROM r.scenario->>'id'
      ORDER BY created_at DESC LIMIT 1;
    IF picked IS NOT NULL THEN RETURN public.resume_lounge_chat(picked); END IF;
    picked:=public.create_voice_lounge(r.host_persona,r.topic,1,coalesce(nick,'나'),coalesce(r.theme,'rooftop'));
    UPDATE public.voice_lounge_rooms SET scenario=r.scenario,story_state=r.story_state,background=r.background,memory=r.memory,ai_model=r.ai_model,voice_on=false
      WHERE id=picked AND host_id=auth.uid();
    INSERT INTO public.voice_lounge_messages(room_id,user_id,nickname,kind,text,created_at,reviewed_at,moderation_verdict)
      SELECT picked,m.user_id,m.nickname,m.kind,m.text,m.created_at,coalesce(m.reviewed_at,now()),m.moderation_verdict
      FROM (SELECT * FROM public.voice_lounge_messages WHERE room_id=p_room ORDER BY id DESC LIMIT 40) m ORDER BY m.id;
    UPDATE public.voice_lounge_rooms SET status='ended',ai_ticket=NULL,ai_ticket_at=NULL WHERE id=p_room AND status<>'ended';
    RETURN picked;
  END IF;
  -- Still open: it stays open a while longer.
  IF r.status IN ('lobby','active') AND coalesce(r.expires_at,r.created_at+interval '2 hours')>now() THEN
    IF r.status='active' THEN UPDATE public.voice_lounge_rooms SET expires_at=greatest(expires_at,now()+interval '30 minutes') WHERE id=p_room; END IF;
    UPDATE public.voice_lounge_members SET active=true,last_seen=now() WHERE room_id=p_room AND user_id=auth.uid();
    RETURN p_room;
  END IF;
  UPDATE public.voice_lounge_rooms SET status='active',started_at=coalesce(started_at,now()),expires_at=now()+interval '1 hour',voice_on=false,
    ai_ticket=NULL,ai_ticket_at=NULL,ai_host_reason=NULL WHERE id=p_room;
  UPDATE public.voice_lounge_members SET active=true,last_seen=now() WHERE room_id=p_room AND user_id=auth.uid();
  RETURN p_room;
END $$;
REVOKE ALL ON FUNCTION public.resume_lounge_chat(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resume_lounge_chat(text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
