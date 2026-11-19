-- Apply after 20270107000000_lounge_message_actions.sql. Not applied automatically on merge: run it in the Supabase SQL editor.
-- (2026-11-20, by the owner) 되감기 takes back what the member said, with the character's answer to it: it goes back in whole
-- exchanges (the member's message and the reply after it), from the last reply, up to five of them (ten messages of the two).
-- Tapping either message of an exchange goes back to before the member's message. 다시 쓰기 still takes back only the last
-- reply (p_reply_only), keeping the member's message for the character to answer again.
BEGIN;

DROP FUNCTION IF EXISTS public.rewind_voice_lounge_chat(uuid,text,bigint,boolean);

-- Returns
--   {state:'done', from, removed, voices:[paths]}  the messages from `from` on are gone and the state is as it was before them,
--   {state:'busy'}     a reply is being written or recorded; try again in a moment,
--   {state:'denied'}   not this member's chat, or not a message that can be taken back.
-- p_consult: 홍실당's state is saved before its reply, so it is taken from the turn before instead.
CREATE OR REPLACE FUNCTION public.rewind_voice_lounge_chat(p_user uuid,p_room text,p_message bigint,p_consult boolean DEFAULT false,p_reply_only boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; target public.voice_lounge_messages; cut_from bigint; cut_turn integer; first_host bigint; window_from bigint;
 snap public.voice_lounge_turn_snapshots; before_snap public.voice_lounge_turn_snapshots; cut_at timestamptz; removed integer; voice_paths jsonb;
BEGIN
 SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
 IF NOT FOUND OR r.host_id<>p_user OR r.capacity<>1 OR r.space_id IS NOT NULL OR NOT r.companion_chat THEN RETURN jsonb_build_object('state','denied'); END IF;
 IF r.ai_ticket IS NOT NULL AND r.ai_ticket_at>now()-interval '15 seconds' THEN RETURN jsonb_build_object('state','busy'); END IF;
 IF EXISTS(SELECT 1 FROM public.voice_lounge_turn_updates WHERE room_id=p_room AND status<>'applied' AND updated_at>now()-interval '90 seconds') THEN RETURN jsonb_build_object('state','busy'); END IF;
 SELECT * INTO target FROM public.voice_lounge_messages WHERE id=p_message AND room_id=p_room;
 IF NOT FOUND OR target.kind NOT IN ('host','human') THEN RETURN jsonb_build_object('state','denied'); END IF;
 IF p_reply_only THEN
  -- 다시 쓰기: the last reply only, from its first message (a reply can be several).
  IF target.kind<>'host' OR EXISTS(SELECT 1 FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='human' AND id>target.id) THEN
   RETURN jsonb_build_object('state','denied');
  END IF;
  cut_from:=target.id;
  SELECT max(m.id) INTO first_host FROM public.voice_lounge_messages m WHERE m.room_id=p_room AND m.id<=target.id
   AND m.id>coalesce((SELECT max(h.id) FROM public.voice_lounge_messages h WHERE h.room_id=p_room AND h.kind='human' AND h.id<target.id),0)
   AND m.id IN (SELECT message_id FROM public.voice_lounge_turn_updates WHERE room_id=p_room AND message_id IS NOT NULL);
  IF first_host IS NOT NULL THEN cut_from:=first_host; END IF;
 ELSE
  -- 되감기: back to before the member's message that starts the exchange, one of the member's last five.
  SELECT min(id) INTO window_from FROM (SELECT id FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='human' ORDER BY id DESC LIMIT 5) w;
  IF target.kind='human' THEN cut_from:=target.id;
  ELSE SELECT max(id) INTO cut_from FROM public.voice_lounge_messages WHERE room_id=p_room AND kind='human' AND id<target.id;
  END IF;
  IF cut_from IS NULL OR window_from IS NULL OR cut_from<window_from THEN RETURN jsonb_build_object('state','denied'); END IF;
 END IF;
 SELECT created_at INTO cut_at FROM public.voice_lounge_messages WHERE id=cut_from;
 SELECT min(turn) INTO cut_turn FROM public.voice_lounge_turn_updates WHERE room_id=p_room AND message_id>=cut_from;
 IF cut_turn IS NOT NULL THEN
  SELECT * INTO snap FROM public.voice_lounge_turn_snapshots WHERE room_id=p_room AND turn>=cut_turn ORDER BY turn LIMIT 1;
  IF snap.room_id IS NOT NULL THEN
   IF p_consult THEN SELECT * INTO before_snap FROM public.voice_lounge_turn_snapshots WHERE room_id=p_room AND turn<cut_turn ORDER BY turn DESC LIMIT 1; END IF;
   UPDATE public.voice_lounge_rooms SET memory=coalesce(snap.room->>'memory',''),memory_turn=coalesce((snap.room->>'memory_turn')::integer,0),
     ai_mood=nullif(snap.room->'ai_mood','null'::jsonb),
     story_state=CASE WHEN NOT p_consult THEN nullif(snap.room->'story_state','null'::jsonb) WHEN before_snap.room_id IS NOT NULL THEN nullif(before_snap.room->'story_state','null'::jsonb) ELSE story_state END
   WHERE id=p_room;
   IF snap.companion IS NULL THEN DELETE FROM public.voice_lounge_companion_state WHERE user_id=p_user AND character_id=r.host_persona;
   ELSE
    INSERT INTO public.voice_lounge_companion_state(user_id,character_id,room_id,state,version,processed_turn)
    VALUES(p_user,r.host_persona,p_room,snap.companion->'state',1,(snap.companion->>'processed_turn')::integer)
    ON CONFLICT(user_id,character_id) DO UPDATE SET state=EXCLUDED.state,processed_turn=EXCLUDED.processed_turn,room_id=p_room,
      version=public.voice_lounge_companion_state.version+1,updated_at=now();
   END IF;
   IF snap.relationship IS NULL THEN DELETE FROM public.voice_lounge_relationships WHERE user_id=p_user AND character_id=r.host_persona;
   ELSE
    UPDATE public.voice_lounge_relationships t SET scores=s.scores,stage=s.stage,pending=s.pending,recent_events=s.recent_events,memories=s.memories,
      meaningful_turns=s.meaningful_turns,turn_count=s.turn_count,last_interaction_at=s.last_interaction_at,version=t.version+1,updated_at=now()
    FROM jsonb_populate_record(NULL::public.voice_lounge_relationships,snap.relationship) s
    WHERE t.user_id=p_user AND t.character_id=r.host_persona;
   END IF;
   DELETE FROM public.voice_lounge_relationship_milestones WHERE user_id=p_user AND character_id=r.host_persona AND room_id=p_room AND created_at>=snap.created_at;
   -- Long-term memories: those made since are gone; the others are as they were (a changed one is embedded again; pins stay the member's).
   DELETE FROM public.voice_lounge_memories m WHERE m.user_id=p_user AND m.character_id=r.host_persona AND m.created_at>=snap.created_at
     AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snap.memories) e WHERE (e->>'id')::uuid=m.id);
   UPDATE public.voice_lounge_memories m SET kind=s.kind,summary=s.summary,follow_up=s.follow_up,importance=s.importance,status=s.status,
     superseded_by=s.superseded_by,mention_count=s.mention_count,updated_at=s.updated_at,last_confirmed_at=s.last_confirmed_at,
     embedding=CASE WHEN m.summary IS DISTINCT FROM s.summary OR m.follow_up IS DISTINCT FROM s.follow_up THEN NULL ELSE m.embedding END
   FROM jsonb_populate_recordset(NULL::public.voice_lounge_memories,snap.memories) s
   WHERE m.id=s.id AND m.user_id=p_user AND m.character_id=r.host_persona
     AND (m.kind,m.summary,m.follow_up,m.importance,m.status,m.superseded_by,m.mention_count,m.last_confirmed_at) IS DISTINCT FROM (s.kind,s.summary,s.follow_up,s.importance,s.status,s.superseded_by,s.mention_count,s.last_confirmed_at);
  END IF;
  DELETE FROM public.voice_lounge_turn_updates WHERE room_id=p_room AND turn>=cut_turn;
  DELETE FROM public.voice_lounge_turn_snapshots WHERE room_id=p_room AND turn>=cut_turn;
  UPDATE public.voice_lounge_rooms SET ai_turns=greatest(cut_turn-1,0) WHERE id=p_room;
 END IF;
 -- Photos sent from then on leave the chat (they still count for the day).
 UPDATE public.lounge_character_posts SET room_id=NULL WHERE room_id=p_room AND created_at>=cut_at;
 SELECT coalesce(jsonb_agg(path),'[]'::jsonb) INTO voice_paths FROM public.lounge_message_voices WHERE room_id=p_room AND message_id>=cut_from;
 DELETE FROM public.voice_lounge_messages WHERE room_id=p_room AND id>=cut_from;
 GET DIAGNOSTICS removed=ROW_COUNT;
 UPDATE public.voice_lounge_rooms SET ai_ticket=NULL,ai_ticket_at=NULL,ai_host_reason=NULL,last_ai_at=now()-interval '1 hour' WHERE id=p_room;
 RETURN jsonb_build_object('state','done','from',cut_from,'removed',removed,'voices',voice_paths);
END $$;
REVOKE ALL ON FUNCTION public.rewind_voice_lounge_chat(uuid,text,bigint,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rewind_voice_lounge_chat(uuid,text,bigint,boolean,boolean) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
