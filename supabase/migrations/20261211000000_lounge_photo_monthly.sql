-- (2026-11-07) Photos are counted by the month, by plan: Plus 10, Pro 30, a member without a plan 3 (the number comes from
-- the server as p_monthly; NULL means no monthly limit, for the super admin). The photos counted are the ones a character
-- sends first and the ones the member asks for, as before (lounge_character_posts of that member); the daily number the
-- admin sets (lounge_image_settings) stays on top as a ceiling. Apply after 20261210060000_lounge_call_testers_limited.sql.
BEGIN;

-- Start of this month in Korean time, for the monthly count.
CREATE OR REPLACE FUNCTION public.lounge_month_start() RETURNS timestamptz
LANGUAGE sql STABLE AS $$ SELECT (date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') $$;

-- A new argument means a new function: the old one goes, so a call without p_monthly cannot be ambiguous.
DROP FUNCTION IF EXISTS public.claim_lounge_character_photo(uuid, text, text, text);
CREATE OR REPLACE FUNCTION public.claim_lounge_character_photo(p_user uuid, p_room text, p_source text, p_scene text, p_monthly integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.lounge_image_settings; used integer; used_month integer; unasked integer; post uuid;
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
  IF p_monthly IS NOT NULL THEN
    SELECT count(*) INTO used_month FROM public.lounge_character_posts WHERE user_id=p_user AND created_at>=public.lounge_month_start();
    IF used_month>=p_monthly THEN RETURN jsonb_build_object('state','month_limit','monthly',p_monthly); END IF;
  END IF;
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
REVOKE ALL ON FUNCTION public.claim_lounge_character_photo(uuid,text,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_lounge_character_photo(uuid,text,text,text,integer) TO service_role;

-- The member's own count, for the photo button: today's and this month's.
CREATE OR REPLACE FUNCTION public.get_my_lounge_photo_usage() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('enabled', s.enabled, 'daily', s.daily_per_user,
    'used', (SELECT count(*) FROM public.lounge_character_posts p WHERE p.user_id=auth.uid() AND p.created_at>=public.lounge_today_start()),
    'monthUsed', (SELECT count(*) FROM public.lounge_character_posts p WHERE p.user_id=auth.uid() AND p.created_at>=public.lounge_month_start()))
  FROM public.lounge_image_settings s WHERE s.id=1;
$$;
REVOKE ALL ON FUNCTION public.get_my_lounge_photo_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_lounge_photo_usage() TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
