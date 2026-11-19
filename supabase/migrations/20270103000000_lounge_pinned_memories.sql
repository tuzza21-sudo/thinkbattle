-- Pinned memories (2026-11-19, by the owner, after Kindroid's Key Memories): a memory the member pins is a settled fact of the two
-- ("둘은 3년 전에 처음 만났다") and goes into every reply, not only when it is chosen among the others. Up to five per conversation.
-- The model cannot change or close a pinned memory (src/lib/relationship/memory.ts drops its operations on one).
-- A database without this migration still works: the API reads the memories without the column, and the pin button says it failed.

ALTER TABLE public.voice_lounge_memories ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.pin_my_lounge_memory(p_id uuid, p_pinned boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.voice_lounge_memories;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT * INTO m FROM public.voice_lounge_memories WHERE id=p_id AND user_id=auth.uid() AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF coalesce(p_pinned,false) AND NOT m.pinned AND (SELECT count(*) FROM public.voice_lounge_memories
      WHERE user_id=auth.uid() AND character_id=m.character_id AND source_room IS NOT DISTINCT FROM m.source_room AND status='active' AND pinned) >= 5 THEN
    RAISE EXCEPTION '고정할 수 있는 기억은 5개까지예요. 다른 기억의 고정을 풀고 다시 시도해 주세요.';
  END IF;
  UPDATE public.voice_lounge_memories SET pinned=coalesce(p_pinned,false), last_confirmed_at=now(), updated_at=now() WHERE id=p_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.pin_my_lounge_memory(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pin_my_lounge_memory(uuid,boolean) TO authenticated;

-- The member's view of the memories: with `pinned`, and the pinned ones first.
CREATE OR REPLACE FUNCTION public.get_my_lounge_memory(p_character text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
  'memories',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'summary',m.summary,'follow_up',m.follow_up,'importance',m.importance,'pinned',m.pinned,'created_at',m.created_at,'updated_at',m.updated_at) ORDER BY m.pinned DESC,m.kind='open_thread' DESC,m.importance DESC,m.updated_at DESC) FROM public.voice_lounge_memories m WHERE m.user_id=auth.uid() AND m.character_id=p_character AND m.source_room=r.id AND m.status='active'),'[]'::jsonb),
  'conversation',coalesce((SELECT state->'room_memory' FROM public.voice_lounge_companion_state s WHERE s.user_id=auth.uid() AND s.character_id=p_character AND s.room_id=r.id),'[]'::jsonb),
  'relationship',(SELECT jsonb_build_object('stage',x.stage,'events',x.memories,'started_at',x.created_at,'turn_count',x.turn_count,'last_at',x.last_interaction_at) FROM public.voice_lounge_relationships x WHERE x.user_id=auth.uid() AND x.character_id=p_character AND x.room_id=r.id),
  'milestones',coalesce((SELECT jsonb_agg(jsonb_build_object('from',x.from_stage,'to',x.to_stage,'at',x.created_at) ORDER BY x.created_at) FROM public.voice_lounge_relationship_milestones x WHERE x.user_id=auth.uid() AND x.character_id=p_character AND x.room_id=r.id),'[]'::jsonb),'limit',40)
 FROM public.voice_lounge_rooms r WHERE r.host_id=auth.uid() AND r.host_persona=p_character AND r.companion_chat
$$;
