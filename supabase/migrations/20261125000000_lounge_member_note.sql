-- Apply after 20261123000000_lounge_story_restart_and_long_prologue.sql (20261124 is a story and not needed first).
-- A member can write a few lines about themselves when they start a story (2026-10-28): their character, manner and what
-- they hope for. The room keeps it with its copy of the story (rooms.scenario.member_note) and the character is told it,
-- like the "user backstory" of other companion services. The longest note is 2,000 characters here; the page limits it
-- by plan (500, 1,000, 2,000) and shows 1,000 to everyone during the test opening.
-- Starting the same story again continues the last room of it; with a note, a room is continued only if it has the same note.
BEGIN;

DROP FUNCTION IF EXISTS public.start_lounge_scenario(text, text);

CREATE OR REPLACE FUNCTION public.start_lounge_scenario(p_scenario text, p_nickname text, p_note text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.lounge_scenarios; picked text; copy jsonb; note text:=left(btrim(coalesce(p_note,'')),2000);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT * INTO s FROM public.lounge_scenarios WHERE id=p_scenario AND active;
  IF NOT FOUND THEN RAISE EXCEPTION '지금은 시작할 수 없는 이야기예요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
  copy := jsonb_build_object('id',s.id,'title',s.title,'prologue',s.prologue,'user_role',s.user_role,'relationship',s.relationship,'place',s.place);
  IF note <> '' THEN copy := copy || jsonb_build_object('member_note',note); END IF;
  SELECT id INTO picked FROM public.voice_lounge_rooms
    WHERE host_id=auth.uid() AND capacity=1 AND space_id IS NULL AND host_persona=s.character_id AND scenario->>'id'=s.id
      AND scenario->>'prologue' IS NOT DISTINCT FROM s.prologue AND scenario->>'user_role' IS NOT DISTINCT FROM s.user_role
      AND scenario->>'relationship' IS NOT DISTINCT FROM s.relationship AND scenario->>'place' IS NOT DISTINCT FROM s.place
      AND (note = '' OR scenario->>'member_note' IS NOT DISTINCT FROM note)
    ORDER BY created_at DESC LIMIT 1;
  IF picked IS NOT NULL THEN RETURN public.resume_lounge_chat(picked); END IF;
  picked := public.create_voice_lounge(s.character_id, s.title, 1, p_nickname, s.theme);
  UPDATE public.voice_lounge_rooms SET scenario=copy WHERE id=picked AND host_id=auth.uid();
  RETURN picked;
END $$;
REVOKE ALL ON FUNCTION public.start_lounge_scenario(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_lounge_scenario(text,text,text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
