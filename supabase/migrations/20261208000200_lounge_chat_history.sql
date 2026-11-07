-- (2026-11-06) Earlier messages of a member's one-to-one chat, for scrolling back through it.
-- The chat page loads the newest 60 messages of its room. This returns the ones before a given message, from the same
-- room and from the member's earlier rooms with the same character (before 20261208000000 a chat could be spread over
-- several rooms; those rooms are kept as ended records, and the policy on voice_lounge_messages only lets a member read
-- the rooms they are active in). Only the owner of the room can call it, and only for their own one-to-one rooms.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_lounge_history(p_room text, p_before bigint DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS TABLE(id bigint, room_id text, user_id uuid, nickname text, kind text, text text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
 SELECT * INTO r FROM public.voice_lounge_rooms WHERE voice_lounge_rooms.id=p_room AND host_id=auth.uid() AND capacity=1 AND space_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION '볼 수 없는 대화예요.'; END IF;
 RETURN QUERY
  SELECT m.id,m.room_id,m.user_id,m.nickname,m.kind,m.text,m.created_at
  FROM public.voice_lounge_messages m
  WHERE m.room_id IN(SELECT x.id FROM public.voice_lounge_rooms x WHERE x.host_id=auth.uid() AND x.host_persona=r.host_persona AND x.capacity=1 AND x.space_id IS NULL)
   AND (p_before IS NULL OR m.id<p_before)
  ORDER BY m.id DESC
  LIMIT least(greatest(coalesce(p_limit,50),1),100);
END $$;
REVOKE ALL ON FUNCTION public.get_my_lounge_history(text,bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_lounge_history(text,bigint,integer) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
