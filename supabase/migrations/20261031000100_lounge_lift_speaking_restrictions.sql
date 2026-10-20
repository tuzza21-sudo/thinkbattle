-- Apply after 20261031000000_lounge_solo_chat.sql (either order works; this only changes data).
-- Speaking restrictions are paused in the app (api/lounge-interaction.ts allows every message unless
-- LOUNGE_MODERATION=on). This lifts the restrictions and warnings already in force. safety_updated_at moves forward
-- so the room's next safety sync gives restricted members their microphone back on the voice server.
-- Words hidden earlier ("대화 보호를 위해 이 발언의 기록을 숨겼어요.") were replaced at the time and cannot be restored.
BEGIN;

UPDATE public.voice_lounge_members
  SET speaking_restricted_until=NULL, moderation_warnings=0, safety_updated_at=clock_timestamp()
  WHERE speaking_restricted_until>now() OR moderation_warnings>0;

COMMIT;
