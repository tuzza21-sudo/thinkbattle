-- Apply after 20261026000000_voice_lounge_talkshow_stage.sql.
-- The owner of a room chooses how many people sit at it (2 up to the place's capacity). Without a value the room
-- keeps the place's capacity as before. Seat checks, room lists and the waiting line already read the room's own
-- capacity, so nothing else changes.
BEGIN;
DROP FUNCTION IF EXISTS public.open_voice_lounge_table(text,text,text,text,text[]);
CREATE OR REPLACE FUNCTION public.open_voice_lounge_table(p_space text,p_nickname text,p_topic text,p_persona text,p_ages text[] DEFAULT '{}',p_capacity integer DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.voice_lounge_spaces; picked text; next_no integer; name text:=left(btrim(coalesce(p_nickname,'')),30);
  body text:=btrim(coalesce(p_topic,'')); ages text[]:=coalesce(p_ages,'{}'); seats integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF name='' THEN RAISE EXCEPTION '닉네임을 확인해 주세요.'; END IF;
  IF length(body) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION '대화 주제는 1~80자로 적어 주세요.'; END IF;
  IF p_persona IS NULL OR p_persona NOT IN ('jaeseok','ina','auditor','closer','velvet','trickster','diplomat','lawyer') THEN
    RAISE EXCEPTION '대화를 도와줄 캐릭터를 골라 주세요.';
  END IF;
  IF NOT ages <@ ARRAY['20s','30s','40s','50s','60s']::text[] THEN RAISE EXCEPTION '올바르지 않은 연령대예요.'; END IF;
  SELECT * INTO s FROM public.voice_lounge_spaces WHERE id=p_space AND open;
  IF NOT FOUND THEN RAISE EXCEPTION '지금은 열려 있지 않은 장소예요.'; END IF;
  seats:=coalesce(p_capacity,s.capacity);
  IF seats<2 OR seats>s.capacity THEN RAISE EXCEPTION '방 인원은 2명부터 %명까지 정할 수 있어요.',s.capacity; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-space:'||p_space,96));
  PERFORM public.tidy_voice_lounge_space(p_space);
  SELECT min(n) INTO next_no FROM generate_series(1,999) n
    WHERE NOT EXISTS(SELECT 1 FROM public.voice_lounge_rooms WHERE space_id=p_space AND status='active' AND table_no=n);
  INSERT INTO public.voice_lounge_rooms(host_id,host_persona,topic,topic_source,topic_set_by,topic_set_at,capacity,status,
      started_at,expires_at,theme,space_id,table_no,guided_session,study_required,age_groups)
    VALUES(auth.uid(),p_persona,body,'member',name,now(),seats,'active',now(),now()+interval '30 minutes',s.theme,p_space,next_no,false,false,
      (SELECT coalesce(array_agg(a ORDER BY a),'{}') FROM (SELECT DISTINCT unnest(ages) a) x))
    RETURNING id INTO picked;
  UPDATE public.voice_lounge_members m SET active=false FROM public.voice_lounge_rooms o
    WHERE m.room_id=o.id AND m.user_id=auth.uid() AND m.active AND o.space_id IS NOT NULL AND o.id<>picked;
  INSERT INTO public.voice_lounge_members(room_id,user_id,nickname) VALUES(picked,auth.uid(),name);
  DELETE FROM public.voice_lounge_waitlist WHERE user_id=auth.uid();
  PERFORM public.close_empty_voice_lounge_tables(auth.uid());
  RETURN picked;
END $$;
REVOKE ALL ON FUNCTION public.open_voice_lounge_table(text,text,text,text,text[],integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.open_voice_lounge_table(text,text,text,text,text[],integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
