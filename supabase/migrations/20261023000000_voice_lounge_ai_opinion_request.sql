-- Apply after 20261022000000_lounge_friends_profiles_notes.sql.
-- A fifth kind of help in rooms with other people: "AI 의견 듣기". The AI gives its view on what is being said, so the
-- conversation goes deeper instead of moving to a new topic. Only the allowed kinds change; nothing else in the request does.
BEGIN;
ALTER TABLE public.voice_lounge_rooms DROP CONSTRAINT IF EXISTS voice_lounge_rooms_request_kind_check;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_rooms_request_kind_check
  CHECK(moderator_request_kind IS NULL OR moderator_request_kind IN ('spark','question','opinion','topic','summary','direct'));

CREATE OR REPLACE FUNCTION public.request_voice_lounge_moderator(p_room text,p_kind text DEFAULT 'spark') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('spark','question','opinion','topic','summary') THEN RAISE EXCEPTION '올바르지 않은 도움 요청이에요.'; END IF;
  PERFORM 1 FROM public.voice_lounge_rooms WHERE id=p_room AND status='active' AND expires_at>now() FOR UPDATE;
  IF NOT FOUND OR NOT public.is_voice_lounge_member(p_room) THEN RAISE EXCEPTION '진행 중인 방에서만 사회자를 부를 수 있어요.'; END IF;
  IF EXISTS(SELECT 1 FROM public.voice_lounge_members WHERE room_id=p_room AND user_id=auth.uid() AND speaking_restricted_until>now()) THEN
    RAISE EXCEPTION '대화 보호를 위해 잠시 발언이 제한되어 있어요.'; END IF;
  -- One pending request at a time; the latest choice decides what kind of help is given.
  UPDATE public.voice_lounge_rooms SET moderator_requested_at=coalesce(moderator_requested_at,now()),
    moderator_requested_by=coalesce(moderator_requested_by,auth.uid()),moderator_request_kind=p_kind WHERE id=p_room;
END $$;
COMMIT;
