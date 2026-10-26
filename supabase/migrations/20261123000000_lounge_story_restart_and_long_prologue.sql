-- Apply after 20261122000000_lounge_diplomat_old_friend_fling.sql.
-- (2026-10-27) Three things about stories:
--   - A prologue may run to 12,000 characters (it was 6,000 since 20261117), for a story card or a member's character.
--   - Starting a story used to continue the member's last room of that story, which keeps its own copy of the story. So a
--     story rewritten later (강무진's "6개월의 연인") still opened with the old prologue. Now a room is continued only while
--     its copy is the story as it is today; once the story has changed, a new room starts with the new text (the old
--     room stays in the chat list). The same for a member's character whose prologue was changed.
--   - 강무진 keeps one story, "6개월의 연인"; "처음 진 날 밤" is removed.
BEGIN;

ALTER TABLE public.lounge_scenarios DROP CONSTRAINT IF EXISTS lounge_scenarios_prologue_check;
ALTER TABLE public.lounge_scenarios ADD CONSTRAINT lounge_scenarios_prologue_check CHECK (length(btrim(prologue)) BETWEEN 20 AND 12000);

DELETE FROM public.lounge_scenarios WHERE id='closer-first-night';

-- start_lounge_scenario(text, text), as defined in 20261112000000_lounge_chat_list.sql, continuing only an up-to-date room.
CREATE OR REPLACE FUNCTION public.start_lounge_scenario(p_scenario text, p_nickname text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.lounge_scenarios; picked text; copy jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT * INTO s FROM public.lounge_scenarios WHERE id=p_scenario AND active;
  IF NOT FOUND THEN RAISE EXCEPTION '지금은 시작할 수 없는 이야기예요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
  copy := jsonb_build_object('id',s.id,'title',s.title,'prologue',s.prologue,'user_role',s.user_role,'relationship',s.relationship,'place',s.place);
  SELECT id INTO picked FROM public.voice_lounge_rooms
    WHERE host_id=auth.uid() AND capacity=1 AND space_id IS NULL AND host_persona=s.character_id AND scenario->>'id'=s.id
      AND scenario->>'prologue' IS NOT DISTINCT FROM s.prologue AND scenario->>'user_role' IS NOT DISTINCT FROM s.user_role
      AND scenario->>'relationship' IS NOT DISTINCT FROM s.relationship AND scenario->>'place' IS NOT DISTINCT FROM s.place
    ORDER BY created_at DESC LIMIT 1;
  IF picked IS NOT NULL THEN RETURN public.resume_lounge_chat(picked); END IF;
  picked := public.create_voice_lounge(s.character_id, s.title, 1, p_nickname, s.theme);
  UPDATE public.voice_lounge_rooms SET scenario=copy WHERE id=picked AND host_id=auth.uid();
  RETURN picked;
END $$;

-- start_lounge_custom_chat(text, text), as defined in 20261116000000_lounge_room_background.sql, with the longer prologue
-- and a new room once the character's prologue, role or starting point has changed.
CREATE OR REPLACE FUNCTION public.start_lounge_custom_chat(p_character text, p_nickname text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.lounge_custom_characters; picked text; story jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT * INTO c FROM public.lounge_custom_characters WHERE id=p_character;
  IF NOT FOUND OR NOT (c.owner_id=auth.uid() OR c.status='public') THEN RAISE EXCEPTION '대화할 수 없는 캐릭터예요.'; END IF;
  IF c.portrait_path IS NULL THEN RAISE EXCEPTION '대표 사진을 정한 뒤 대화할 수 있어요.'; END IF;
  IF length(btrim(coalesce(c.sheet->>'prologue',''))) >= 20 THEN
    story := jsonb_build_object('id','custom-story','title',left(c.name||'와(과)의 이야기',40),
      'prologue',left(btrim(c.sheet->>'prologue'),12000),'user_role',left(btrim(coalesce(c.sheet->>'userRole','')),120),
      'relationship',left(btrim(coalesce(c.sheet->>'storyRelationship','')),200),'place','');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
  SELECT id INTO picked FROM public.voice_lounge_rooms
    WHERE host_id=auth.uid() AND capacity=1 AND space_id IS NULL AND host_persona=p_character
    ORDER BY created_at DESC LIMIT 1;
  -- The last room is continued unless the character's story changed since it started.
  IF picked IS NOT NULL AND (story IS NULL OR EXISTS (SELECT 1 FROM public.voice_lounge_rooms r WHERE r.id=picked
      AND r.scenario->>'prologue' IS NOT DISTINCT FROM story->>'prologue' AND r.scenario->>'user_role' IS NOT DISTINCT FROM story->>'user_role'
      AND r.scenario->>'relationship' IS NOT DISTINCT FROM story->>'relationship')) THEN
    RETURN public.resume_lounge_chat(picked);
  END IF;
  picked := public.create_voice_lounge(p_character,'둘이서 편하게 이야기해요',1,p_nickname,c.theme);
  IF story IS NOT NULL THEN UPDATE public.voice_lounge_rooms SET scenario=story WHERE id=picked AND host_id=auth.uid(); END IF;
  RETURN picked;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
