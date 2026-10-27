-- Apply after 20261125000000_lounge_member_note.sql.
-- Stories told in episodes (2026-10-28, first 선우령's 《검은 장미》, six episodes; see src/lib/loungeStory.ts).
--   - lounge_scenarios.episodes: the episodes of a story (scene, goal, how the character leads, checkpoints, what may and may
--     not be told, the relationship stage needed to go on). Written from docs/stories/*.json by scripts/upsert-lounge-story.mjs.
--   - voice_lounge_rooms.story_state: where the room is in its story ({episode, done, opened, complete}), written by the
--     server (service role) after each reply. The page reads it with the room.
--   - start_lounge_scenario copies the episodes with the story, and continues a room only while its copy has the same ones.
BEGIN;

ALTER TABLE public.lounge_scenarios ADD COLUMN IF NOT EXISTS episodes jsonb CHECK (episodes IS NULL OR jsonb_typeof(episodes)='array');
ALTER TABLE public.voice_lounge_rooms ADD COLUMN IF NOT EXISTS story_state jsonb CHECK (story_state IS NULL OR jsonb_typeof(story_state)='object');

-- start_lounge_scenario(text, text, text), as defined in 20261125000000_lounge_member_note.sql, with the episodes.
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
  IF s.episodes IS NOT NULL AND jsonb_array_length(s.episodes) > 0 THEN copy := copy || jsonb_build_object('episodes',s.episodes); END IF;
  SELECT id INTO picked FROM public.voice_lounge_rooms
    WHERE host_id=auth.uid() AND capacity=1 AND space_id IS NULL AND host_persona=s.character_id AND scenario->>'id'=s.id
      AND scenario->>'prologue' IS NOT DISTINCT FROM s.prologue AND scenario->>'user_role' IS NOT DISTINCT FROM s.user_role
      AND scenario->>'relationship' IS NOT DISTINCT FROM s.relationship AND scenario->>'place' IS NOT DISTINCT FROM s.place
      AND scenario->'episodes' IS NOT DISTINCT FROM copy->'episodes'
      AND (note = '' OR scenario->>'member_note' IS NOT DISTINCT FROM note)
    ORDER BY created_at DESC LIMIT 1;
  IF picked IS NOT NULL THEN RETURN public.resume_lounge_chat(picked); END IF;
  picked := public.create_voice_lounge(s.character_id, s.title, 1, p_nickname, s.theme);
  UPDATE public.voice_lounge_rooms SET scenario=copy, story_state=NULL WHERE id=picked AND host_id=auth.uid();
  RETURN picked;
END $$;
REVOKE ALL ON FUNCTION public.start_lounge_scenario(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_lounge_scenario(text,text,text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
