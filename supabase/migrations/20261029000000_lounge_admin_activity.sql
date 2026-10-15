-- Apply after 20261028000000_user_first_touch.sql (and supabase_super_admin_migration.sql, which defines is_super_admin()).
-- Lets the super admin look up a member's lounge activity and read the conversations of the rooms they were in.
-- Every time a conversation is opened, who opened it, when, and which member it was opened for is written to
-- lounge_admin_access_log, which nobody but the service role can read. Room transcripts are now kept 30 days
-- (they were 24 hours) and the cleanup is scheduled hourly with pg_cron when that extension can be turned on.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lounge_admin_access_log(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('view_user','view_room')),
  target_user uuid,
  room_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lounge_admin_access_log_created ON public.lounge_admin_access_log(created_at DESC);
ALTER TABLE public.lounge_admin_access_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_admin_access_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lounge_admin_access_log TO service_role;

-- Members matching the search, newest activity first. Opening this list is not logged; opening a member or a room is.
CREATE OR REPLACE FUNCTION public.admin_lounge_users(p_query text DEFAULT '', p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q text:=lower(trim(coalesce(p_query,'')));
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t."sortAt" DESC)
    FROM (
      SELECT u.id AS "userId", u.nickname, u.email, u.gender, u.age_group AS "ageGroup", u.region,
        u.created_at AS "joinedAt", a.last_sign_in_at AS "lastSignInAt",
        act."lastActiveAt", act."roomCount", act."messageCount", act."warnings",
        coalesce(act."lastActiveAt", a.last_sign_in_at, u.created_at) AS "sortAt"
      FROM public.users u
      LEFT JOIN auth.users a ON a.id=u.id
      CROSS JOIN LATERAL (
        SELECT max(m.last_seen) AS "lastActiveAt", count(*)::int AS "roomCount",
          coalesce(sum(m.moderation_warnings),0)::int AS "warnings",
          (SELECT count(*)::int FROM public.voice_lounge_messages g WHERE g.user_id=u.id AND g.kind='human') AS "messageCount"
        FROM public.voice_lounge_members m WHERE m.user_id=u.id
      ) act
      WHERE q='' OR position(q IN lower(coalesce(u.nickname,'')))>0 OR position(q IN lower(coalesce(u.email,'')))>0
      ORDER BY coalesce(act."lastActiveAt", a.last_sign_in_at, u.created_at) DESC
      LIMIT least(greatest(coalesce(p_limit,50),1),200)
    ) t
  ),'[]'::jsonb);
END $$;

-- One member: profile and the rooms still kept (up to 100, newest first) with who else was there.
CREATE OR REPLACE FUNCTION public.admin_lounge_user_activity(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_user) THEN RAISE EXCEPTION 'user not found'; END IF;
  INSERT INTO public.lounge_admin_access_log(admin_id,action,target_user) VALUES(auth.uid(),'view_user',p_user);
  SELECT jsonb_build_object(
    'profile', (SELECT jsonb_build_object('userId',u.id,'nickname',u.nickname,'email',u.email,'gender',u.gender,'ageGroup',u.age_group,
        'region',u.region,'provider',u.provider,'joinedAt',u.created_at,'lastSignInAt',a.last_sign_in_at)
      FROM public.users u LEFT JOIN auth.users a ON a.id=u.id WHERE u.id=p_user),
    'rooms', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x."createdAt" DESC)
      FROM (
        SELECT r.id AS "roomId", r.topic, r.host_persona AS "persona", s.name AS "space", r.capacity, r.status,
          r.created_at AS "createdAt", r.started_at AS "startedAt", (r.host_id=p_user) AS "isHost",
          m.joined_at AS "joinedAt", m.moderation_warnings AS "warnings", m.speaking_restricted_until AS "restrictedUntil",
          m.restriction_reason AS "restrictionReason",
          (SELECT count(*)::int FROM public.voice_lounge_messages g WHERE g.room_id=r.id AND g.user_id=p_user AND g.kind='human') AS "messageCount",
          coalesce((SELECT jsonb_agg(jsonb_build_object('userId',o.user_id,'nickname',o.nickname) ORDER BY o.joined_at)
            FROM public.voice_lounge_members o WHERE o.room_id=r.id AND o.user_id<>p_user),'[]'::jsonb) AS "others"
        FROM public.voice_lounge_members m
        JOIN public.voice_lounge_rooms r ON r.id=m.room_id
        LEFT JOIN public.voice_lounge_spaces s ON s.id=r.space_id
        WHERE m.user_id=p_user
        ORDER BY r.created_at DESC LIMIT 100
      ) x
    ),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

-- The conversation of one room (up to 2000 messages, oldest first). Logged with the member it was opened for.
CREATE OR REPLACE FUNCTION public.admin_lounge_room_messages(p_room text, p_user uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.voice_lounge_rooms WHERE id=p_room) THEN RAISE EXCEPTION 'room not found'; END IF;
  INSERT INTO public.lounge_admin_access_log(admin_id,action,target_user,room_id) VALUES(auth.uid(),'view_room',p_user,p_room);
  SELECT jsonb_build_object(
    'room', (SELECT jsonb_build_object('roomId',r.id,'topic',r.topic,'persona',r.host_persona,'space',s.name,'capacity',r.capacity,
        'status',r.status,'createdAt',r.created_at,'startedAt',r.started_at)
      FROM public.voice_lounge_rooms r LEFT JOIN public.voice_lounge_spaces s ON s.id=r.space_id WHERE r.id=p_room),
    'members', coalesce((SELECT jsonb_agg(jsonb_build_object('userId',m.user_id,'nickname',m.nickname,'joinedAt',m.joined_at,
        'warnings',m.moderation_warnings) ORDER BY m.joined_at) FROM public.voice_lounge_members m WHERE m.room_id=p_room),'[]'::jsonb),
    'messages', coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'userId',g.user_id,'nickname',g.nickname,'kind',g.kind,
        'text',g.text,'createdAt',g.created_at) ORDER BY g.id)
      FROM (SELECT * FROM public.voice_lounge_messages WHERE room_id=p_room ORDER BY id LIMIT 2000) g),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.admin_lounge_users(text,integer), public.admin_lounge_user_activity(uuid),
  public.admin_lounge_room_messages(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_lounge_users(text,integer), public.admin_lounge_user_activity(uuid),
  public.admin_lounge_room_messages(text,uuid) TO authenticated;

-- Transcripts are kept 30 days after a room ends, then deleted with their members and messages. Access-log rows older
-- than a year go too. Called hourly by the job below, or by hand with the service role.
CREATE OR REPLACE FUNCTION public.cleanup_voice_lounges() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE removed bigint;
BEGIN
  DELETE FROM public.voice_lounge_rooms WHERE coalesce(expires_at,created_at+interval '2 hours')<now()-interval '30 days';
  GET DIAGNOSTICS removed=ROW_COUNT;
  DELETE FROM public.lounge_admin_access_log WHERE created_at<now()-interval '1 year';
  RETURN removed;
END $$;

-- Run the cleanup every hour. If pg_cron cannot be turned on from here, enable it in the Supabase dashboard
-- (Database > Extensions > pg_cron) and run this block again.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('cleanup-voice-lounges','17 * * * *','SELECT public.cleanup_voice_lounges()');
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'cleanup-voice-lounges was not scheduled (%). Enable pg_cron in the Supabase dashboard and run this block again.', SQLERRM;
END $$;
COMMIT;
