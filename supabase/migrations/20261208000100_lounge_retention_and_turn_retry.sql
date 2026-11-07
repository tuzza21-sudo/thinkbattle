-- (2026-11-06) Follow-up to 20261208000000_lounge_room_state.sql.
--   1. A member's continuing chat with a character (companion_chat) is kept until the member deletes it or leaves the
--      service. The hourly cleanup no longer removes it after 30 days; with the chat go its relationship, memories and
--      scene state, so deleting them by age would reset a long relationship. Every other room is still cleaned as before.
--   2. A post-reply update that keeps failing is given up after 3 tries so it cannot hold back every later turn.
BEGIN;

CREATE OR REPLACE FUNCTION public.cleanup_voice_lounges() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE removed bigint;
BEGIN
  DELETE FROM public.voice_lounge_rooms WHERE NOT companion_chat AND coalesce(expires_at,created_at+interval '2 hours')<now()-interval '30 days';
  GET DIAGNOSTICS removed=ROW_COUNT;
  DELETE FROM public.lounge_admin_access_log WHERE created_at<now()-interval '1 year';
  DELETE FROM public.lounge_daily_usage WHERE day<public.lounge_today()-14;
  RETURN removed;
END $$;

ALTER TABLE public.voice_lounge_turn_updates ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

-- Records one failed try of a turn's update. Below the limit the turn stays and is tried again no sooner than a minute
-- later ('retry'); at the limit it is closed without being applied, so the turns after it can go on ('skipped').
CREATE OR REPLACE FUNCTION public.fail_voice_lounge_turn(p_user uuid,p_character text,p_room text,p_turn integer,p_max integer DEFAULT 3) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job public.voice_lounge_turn_updates;
BEGIN
 PERFORM 1 FROM public.voice_lounge_rooms WHERE id=p_room AND host_id=p_user AND host_persona=p_character AND companion_chat FOR UPDATE;
 IF NOT FOUND THEN RETURN 'missing'; END IF;
 SELECT * INTO job FROM public.voice_lounge_turn_updates WHERE room_id=p_room AND turn=p_turn AND user_id=p_user AND character_id=p_character FOR UPDATE;
 IF NOT FOUND OR job.status='applied' THEN RETURN 'missing'; END IF;
 IF job.attempts+1>=greatest(coalesce(p_max,3),1) THEN
  UPDATE public.voice_lounge_turn_updates SET status='applied',attempts=attempts+1,payload='{"skipped":true}'::jsonb,updated_at=now() WHERE room_id=p_room AND turn=p_turn;
  RETURN 'skipped';
 END IF;
 UPDATE public.voice_lounge_turn_updates SET attempts=attempts+1,updated_at=now() WHERE room_id=p_room AND turn=p_turn;
 RETURN 'retry';
END $$;
REVOKE ALL ON FUNCTION public.fail_voice_lounge_turn(uuid,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fail_voice_lounge_turn(uuid,text,text,integer,integer) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
