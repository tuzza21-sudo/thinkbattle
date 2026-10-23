-- Apply after 20261031000000_lounge_solo_chat.sql.
-- Character photos. A character can send a photo of what they are doing in a one-to-one conversation, when the member
-- asks or now and then on their own, and posts a photo from their day to a public gallery once a day.
--
-- lounge_character_posts is built to become the characters' own social feed later: every photo is a post with a
-- caption written by the character. Photos from a conversation are private to that member (bucket
-- lounge-character-private, under the member's folder); the character's own posts are public (bucket
-- lounge-character-public). The server writes everything with the service role; members only read.
-- Each member may have a few photos made a day (lounge_image_settings, 5 by default), of which at most two are sent
-- unasked. A failed photo does not count.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lounge_character_posts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id text NOT NULL,
  -- The member a private photo belongs to; NULL for the character's own public posts.
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id text REFERENCES public.voice_lounge_rooms(id) ON DELETE SET NULL,
  visibility text NOT NULL CHECK (visibility IN ('private','public')),
  source text NOT NULL CHECK (source IN ('request','character','daily')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready')),
  scene text NOT NULL DEFAULT '' CHECK (length(scene)<=600),
  caption text NOT NULL DEFAULT '' CHECK (length(caption)<=400),
  image_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lounge_character_posts_owner CHECK ((visibility='private') = (user_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS lounge_character_posts_feed ON public.lounge_character_posts(character_id, visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS lounge_character_posts_member ON public.lounge_character_posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lounge_character_posts_room ON public.lounge_character_posts(room_id, created_at);

ALTER TABLE public.lounge_character_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_character_posts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lounge_character_posts TO anon, authenticated;
GRANT ALL ON TABLE public.lounge_character_posts TO service_role;
DROP POLICY IF EXISTS lounge_character_posts_read ON public.lounge_character_posts;
CREATE POLICY lounge_character_posts_read ON public.lounge_character_posts FOR SELECT TO anon, authenticated
  USING (status='ready' AND (visibility='public' OR user_id=auth.uid()));

CREATE TABLE IF NOT EXISTS public.lounge_image_settings(
  id integer PRIMARY KEY DEFAULT 1 CHECK (id=1),
  enabled boolean NOT NULL DEFAULT true,
  daily_per_user integer NOT NULL DEFAULT 5 CHECK (daily_per_user BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.lounge_image_settings(id) VALUES(1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.lounge_image_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_image_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lounge_image_settings TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lounge-character-public', 'lounge-character-public', true, 5242880, ARRAY['image/webp','image/png','image/jpeg']),
       ('lounge-character-private', 'lounge-character-private', false, 5242880, ARRAY['image/webp','image/png','image/jpeg'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS lounge_character_private_read_own ON storage.objects;
CREATE POLICY lounge_character_private_read_own ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'lounge-character-private' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Start of today in Korean time, for the daily count.
CREATE OR REPLACE FUNCTION public.lounge_today_start() RETURNS timestamptz
LANGUAGE sql STABLE AS $$ SELECT (public.lounge_today()::timestamp AT TIME ZONE 'Asia/Seoul') $$;

-- Server only (service role): reserves one photo for a member in their own one-to-one room, or says why not.
-- state: claimed (with id), denied, disabled, busy (a photo is still being made), limit, character_limit.
CREATE OR REPLACE FUNCTION public.claim_lounge_character_photo(p_user uuid, p_room text, p_source text, p_scene text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.lounge_image_settings; used integer; unasked integer; post uuid;
BEGIN
  IF p_source NOT IN ('request','character') THEN RAISE EXCEPTION 'invalid photo source'; END IF;
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room;
  IF NOT FOUND OR r.host_id<>p_user OR r.capacity<>1 OR r.space_id IS NOT NULL OR r.status<>'active' THEN
    RETURN jsonb_build_object('state','denied'); END IF;
  SELECT * INTO s FROM public.lounge_image_settings WHERE id=1;
  IF NOT FOUND OR NOT s.enabled THEN RETURN jsonb_build_object('state','disabled'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('lounge-photo:'||p_user::text, 41));
  -- A photo still pending after three minutes failed without cleaning up; it no longer counts.
  DELETE FROM public.lounge_character_posts WHERE user_id=p_user AND status='pending' AND created_at<now()-interval '3 minutes';
  IF EXISTS(SELECT 1 FROM public.lounge_character_posts WHERE user_id=p_user AND status='pending') THEN
    RETURN jsonb_build_object('state','busy'); END IF;
  SELECT count(*) INTO used FROM public.lounge_character_posts WHERE user_id=p_user AND created_at>=public.lounge_today_start();
  IF used>=s.daily_per_user THEN RETURN jsonb_build_object('state','limit','daily',s.daily_per_user); END IF;
  IF p_source='character' THEN
    SELECT count(*) INTO unasked FROM public.lounge_character_posts
      WHERE user_id=p_user AND source='character' AND created_at>=public.lounge_today_start();
    IF unasked>=2 THEN RETURN jsonb_build_object('state','character_limit'); END IF;
  END IF;
  INSERT INTO public.lounge_character_posts(character_id,user_id,room_id,visibility,source,scene)
    VALUES(r.host_persona,p_user,p_room,'private',p_source,left(coalesce(p_scene,''),600)) RETURNING id INTO post;
  RETURN jsonb_build_object('state','claimed','id',post,'character',r.host_persona,'left',s.daily_per_user-used-1);
END $$;
REVOKE ALL ON FUNCTION public.claim_lounge_character_photo(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_lounge_character_photo(uuid,text,text,text) TO service_role;

-- The member's own allowance, for the photo button.
CREATE OR REPLACE FUNCTION public.get_my_lounge_photo_usage() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('enabled', s.enabled, 'daily', s.daily_per_user,
    'used', (SELECT count(*) FROM public.lounge_character_posts p WHERE p.user_id=auth.uid() AND p.created_at>=public.lounge_today_start()))
  FROM public.lounge_image_settings s WHERE s.id=1;
$$;
REVOKE ALL ON FUNCTION public.get_my_lounge_photo_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_lounge_photo_usage() TO authenticated;

-- Admin: turn photos on or off and set the daily number per member.
CREATE OR REPLACE FUNCTION public.admin_get_lounge_image_settings() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN (SELECT jsonb_build_object('enabled',s.enabled,'daily',s.daily_per_user,
    'today',(SELECT count(*) FROM public.lounge_character_posts p WHERE p.created_at>=public.lounge_today_start() AND p.status='ready'))
    FROM public.lounge_image_settings s WHERE s.id=1);
END $$;
CREATE OR REPLACE FUNCTION public.admin_set_lounge_image_settings(p_enabled boolean, p_daily integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_daily NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'daily out of range'; END IF;
  UPDATE public.lounge_image_settings SET enabled=coalesce(p_enabled,true), daily_per_user=p_daily, updated_at=now() WHERE id=1;
END $$;
REVOKE ALL ON FUNCTION public.admin_get_lounge_image_settings(), public.admin_set_lounge_image_settings(boolean,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_lounge_image_settings(), public.admin_set_lounge_image_settings(boolean,integer) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
