-- Apply after 20261125000000_lounge_member_note.sql.
-- (2026-11-01) A one-to-one chat is a messenger conversation now, and a story card only sets how it opens. Starting a
-- story the member has already begun offers two buttons: continue the conversation (as before), or start it again from
-- the prologue (p_fresh), which opens a new room; the old one stays in the chat list. The relationship and the
-- long-term memories with the character are kept either way.
BEGIN;

DROP FUNCTION IF EXISTS public.start_lounge_scenario(text, text, text);

CREATE OR REPLACE FUNCTION public.start_lounge_scenario(p_scenario text, p_nickname text, p_note text DEFAULT NULL, p_fresh boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.lounge_scenarios; picked text; copy jsonb; note text:=left(btrim(coalesce(p_note,'')),2000);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT * INTO s FROM public.lounge_scenarios WHERE id=p_scenario AND active;
  IF NOT FOUND THEN RAISE EXCEPTION '지금은 시작할 수 없는 이야기예요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
  copy := jsonb_build_object('id',s.id,'title',s.title,'prologue',s.prologue,'user_role',s.user_role,'relationship',s.relationship,'place',s.place);
  IF note <> '' THEN copy := copy || jsonb_build_object('member_note',note); END IF;
  IF NOT coalesce(p_fresh,false) THEN
    SELECT id INTO picked FROM public.voice_lounge_rooms
      WHERE host_id=auth.uid() AND capacity=1 AND space_id IS NULL AND host_persona=s.character_id AND scenario->>'id'=s.id
        AND scenario->>'prologue' IS NOT DISTINCT FROM s.prologue AND scenario->>'user_role' IS NOT DISTINCT FROM s.user_role
        AND scenario->>'relationship' IS NOT DISTINCT FROM s.relationship AND scenario->>'place' IS NOT DISTINCT FROM s.place
        AND (note = '' OR scenario->>'member_note' IS NOT DISTINCT FROM note)
      ORDER BY created_at DESC LIMIT 1;
    IF picked IS NOT NULL THEN RETURN public.resume_lounge_chat(picked); END IF;
  END IF;
  picked := public.create_voice_lounge(s.character_id, s.title, 1, p_nickname, s.theme);
  UPDATE public.voice_lounge_rooms SET scenario=copy WHERE id=picked AND host_id=auth.uid();
  RETURN picked;
END $$;
REVOKE ALL ON FUNCTION public.start_lounge_scenario(text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_lounge_scenario(text,text,text,boolean) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
