-- Apply after 20261017000000_voice_lounge_age_limits_and_free_solo.sql.
-- A solo (one-to-one) conversation was titled after the place it started from ("<place>에서 둘이서"). A character can
-- now be met from any place, and the Han River place replaced the hotel bar of the same character, so Sunwooryeong's
-- one-to-one read "한강 야경에서 둘이서". The topic no longer names a place; the scenery still comes from the place.
CREATE OR REPLACE FUNCTION public.start_voice_lounge_solo(p_space text,p_nickname text,p_persona text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.voice_lounge_spaces; picked text; persona text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT * INTO s FROM public.voice_lounge_spaces WHERE id=p_space AND open;
  IF NOT FOUND THEN RAISE EXCEPTION '지금은 열려 있지 않은 공간이에요.'; END IF;
  persona:=coalesce(p_persona,s.host_persona);
  IF persona NOT IN ('jaeseok','ina','auditor','closer','velvet','trickster','diplomat','lawyer') THEN RAISE EXCEPTION '대화를 도와줄 캐릭터를 골라 주세요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
  SELECT id INTO picked FROM public.voice_lounge_rooms
    WHERE host_id=auth.uid() AND capacity=1 AND space_id IS NULL AND host_persona=persona
      AND status IN ('lobby','active') AND coalesce(expires_at,created_at+interval '2 hours')>now()
    ORDER BY created_at DESC LIMIT 1;
  IF picked IS NOT NULL THEN RETURN picked; END IF;
  RETURN public.create_voice_lounge(persona,'둘이서 편하게 이야기해요',1,p_nickname,s.theme,false);
END $$;
NOTIFY pgrst,'reload schema';
