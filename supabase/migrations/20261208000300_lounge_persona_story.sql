-- (2026-11-07) A persona can carry the member's own narrative with one character (story_character, story). In a room
-- with that character the narrative takes the place of the story card the room was started from (api/lounge.ts,
-- loungePersonaStoryScenario). The room's copy of a chosen persona carries the two as well.
BEGIN;

ALTER TABLE public.lounge_member_personas
  ADD COLUMN IF NOT EXISTS story_character text NOT NULL DEFAULT '' CHECK (length(story_character) <= 60),
  ADD COLUMN IF NOT EXISTS story text NOT NULL DEFAULT '' CHECK (length(story) <= 2000);

-- set_lounge_room_persona(text, uuid, boolean), as defined in 20261128000000_lounge_memory_editing_and_personas.sql,
-- with the narrative in the room's copy.
CREATE OR REPLACE FUNCTION public.set_lounge_room_persona(p_room text, p_persona uuid DEFAULT NULL, p_none boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.lounge_member_personas; chosen jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.voice_lounge_rooms WHERE id=p_room AND host_id=auth.uid() AND capacity=1 AND space_id IS NULL) THEN
    RAISE EXCEPTION '내 1:1 대화에서만 페르소나를 고를 수 있어요.';
  END IF;
  IF p_persona IS NOT NULL THEN
    SELECT * INTO p FROM public.lounge_member_personas WHERE id=p_persona AND user_id=auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION '페르소나를 찾지 못했어요.'; END IF;
    chosen := jsonb_build_object('id',p.id,'title',p.title,'call_name',p.call_name,'job',p.job,'personality',p.personality,'details',p.details,
      'story_character',p.story_character,'story',p.story);
  ELSIF p_none THEN chosen := jsonb_build_object('none',true);
  END IF;
  UPDATE public.voice_lounge_rooms SET member_persona=chosen WHERE id=p_room;
  RETURN chosen;
END $$;
REVOKE ALL ON FUNCTION public.set_lounge_room_persona(text,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lounge_room_persona(text,uuid,boolean) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
