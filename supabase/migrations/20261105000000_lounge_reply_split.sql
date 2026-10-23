-- Apply after 20261104000000_lounge_gpt_models.sql.
-- A one-to-one reply is now two calls: the reply itself, saved the moment it is written so the next turn can start, and
-- a second call after it that writes the room summary, the relationship events and the long-term memory changes.
-- Long-term memories are also found by what is being talked about, not only by importance.
--
-- 1) finish_voice_lounge_reply saves the reply without touching the room summary (finish_voice_lounge_host still does both).
-- 2) save_voice_lounge_room_memory writes the summary afterwards. The next turn may already have started by then, so a
--    summary is only written if no later turn's summary is there (memory_turn).
-- 3) Long-term memories get an embedding (256 numbers of length one, as the character knowledge has). Changing what a
--    memory says clears it, so it is made again. The server fills missing ones a few at a time after replies, which also
--    fills the memories that existed before this migration.
BEGIN;

ALTER TABLE public.voice_lounge_rooms ADD COLUMN IF NOT EXISTS memory_turn integer;
ALTER TABLE public.voice_lounge_memories ADD COLUMN IF NOT EXISTS embedding real[];

CREATE OR REPLACE FUNCTION public.voice_lounge_memory_embedding_reset() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.summary IS DISTINCT FROM OLD.summary OR NEW.follow_up IS DISTINCT FROM OLD.follow_up THEN NEW.embedding:=NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS voice_lounge_memory_embedding_reset ON public.voice_lounge_memories;
CREATE TRIGGER voice_lounge_memory_embedding_reset BEFORE UPDATE ON public.voice_lounge_memories
  FOR EACH ROW EXECUTE FUNCTION public.voice_lounge_memory_embedding_reset();

-- Same as finish_voice_lounge_host (20261031000000) except that the room summary is left as it is.
CREATE OR REPLACE FUNCTION public.finish_voice_lounge_reply(p_room text,p_ticket uuid,p_text text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; s public.voice_lounge_sessions; answered boolean;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR NOT public.voice_lounge_drives_ai(r,auth.uid()) OR r.ai_ticket IS DISTINCT FROM p_ticket
    OR r.status<>'active' OR r.expires_at<=now() OR r.ai_ticket_at<now()-interval '60 seconds' THEN RETURN false; END IF;
  IF r.guided_session THEN
    SELECT * INTO s FROM public.voice_lounge_sessions WHERE room_id=p_room FOR UPDATE;
    IF NOT FOUND OR s.turn_id IS DISTINCT FROM r.ai_session_turn OR s.state NOT IN ('ready','free') THEN
      UPDATE public.voice_lounge_rooms SET ai_ticket=NULL,ai_ticket_at=NULL,ai_host_reason=NULL WHERE id=p_room;
      RETURN false;
    END IF;
  END IF;
  IF length(trim(p_text)) NOT BETWEEN 1 AND 1200 THEN RAISE EXCEPTION 'invalid host response'; END IF;
  answered:=r.ai_host_reason='requested' AND r.moderator_requested_at<=r.ai_ticket_at;
  INSERT INTO public.voice_lounge_messages(room_id,nickname,kind,text) VALUES(p_room,'AI 사회자','host',trim(p_text));
  UPDATE public.voice_lounge_rooms SET ai_ticket=NULL,ai_ticket_at=NULL,ai_host_reason=NULL,
    moderator_requested_at=CASE WHEN answered THEN NULL ELSE moderator_requested_at END,
    moderator_requested_by=CASE WHEN answered THEN NULL ELSE moderator_requested_by END,
    moderator_request_kind=CASE WHEN answered THEN NULL ELSE moderator_request_kind END WHERE id=p_room;
  IF r.guided_session AND r.ai_host_reason='opening' THEN
    UPDATE public.voice_lounge_sessions SET announced_turn=s.turn_id,announced_stage=s.stage,updated_at=clock_timestamp() WHERE room_id=p_room;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_voice_lounge_reply(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finish_voice_lounge_reply(text,uuid,text) TO authenticated;

-- The summary written after reply number p_turn (the room's ai_turns when it was claimed). The room may have ended
-- meanwhile: its last summary is still what the next conversation starts from.
CREATE OR REPLACE FUNCTION public.save_voice_lounge_room_memory(p_room text,p_memory text,p_turn integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR NOT (public.voice_lounge_drives_ai(r,auth.uid()) OR public.voice_lounge_one_to_one(r,auth.uid()))
    OR p_memory IS NULL OR p_turn IS NULL OR p_turn<coalesce(r.memory_turn,0) THEN RETURN false; END IF;
  UPDATE public.voice_lounge_rooms SET memory=left(p_memory,1800),memory_turn=p_turn WHERE id=p_room;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.save_voice_lounge_room_memory(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_voice_lounge_room_memory(text,text,integer) TO authenticated;

-- How close each active memory of a user and character is to what was just said (both vectors have length one, so the
-- dot product is the cosine similarity). Memories without an embedding yet are left out.
CREATE OR REPLACE FUNCTION public.score_voice_lounge_memories(p_user uuid,p_character text,p_query real[])
RETURNS TABLE(id uuid, score real) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
BEGIN
  IF p_query IS NULL OR cardinality(p_query)<>256 THEN RETURN; END IF;
  RETURN QUERY SELECT m.id, (SELECT coalesce(sum(a*b),0) FROM unnest(m.embedding,p_query) AS t(a,b))::real
    FROM public.voice_lounge_memories m
    WHERE m.user_id=p_user AND m.character_id=p_character AND m.status='active' AND m.embedding IS NOT NULL;
END $$;

-- Stores embeddings made by the server: [{"id": uuid, "embedding": [256 numbers]}], at most 20.
CREATE OR REPLACE FUNCTION public.set_voice_lounge_memory_embeddings(p_items jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; vector real[]; saved integer:=0;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)>20 THEN RAISE EXCEPTION 'invalid memory embeddings'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT array_agg(value::real ORDER BY position) INTO vector FROM jsonb_array_elements_text(item->'embedding') WITH ORDINALITY AS t(value,position);
    IF cardinality(vector)<>256 THEN CONTINUE; END IF;
    UPDATE public.voice_lounge_memories SET embedding=vector WHERE id=(item->>'id')::uuid;
    IF FOUND THEN saved:=saved+1; END IF;
  END LOOP;
  RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.score_voice_lounge_memories(uuid,text,real[]),public.set_voice_lounge_memory_embeddings(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.score_voice_lounge_memories(uuid,text,real[]),public.set_voice_lounge_memory_embeddings(jsonb) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
