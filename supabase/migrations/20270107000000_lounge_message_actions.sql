-- Apply after 20270106000000_lounge_dohyun_late_arrival.sql. Not applied automatically on merge: run it in the Supabase SQL editor.
-- (2026-11-20, by the owner) A message in a one-to-one chat can be tapped for three things:
--   * 다시 쓰기 (the character's last reply is written again),
--   * 음성으로 듣기 (the reply read in the character's voice; a month of 3 minutes without a plan, 30 with Plus),
--   * 되감기 (the conversation goes back to before one of its last 10 messages, and the character no longer knows what came after).
-- Going back is exact because every turn's commit first keeps what it is about to change (voice_lounge_turn_snapshots): the room's
-- summary, mood and story, the companion state, the relationship and the long-term memories. Going back to a turn restores the
-- snapshot taken before it and removes the messages, turns, snapshots, milestones and memories after it; photos sent after it leave
-- the chat (they still count for the day). Voices made for removed messages are removed with them (the month's count keeps them).
BEGIN;

-- Which message each turn's reply starts at (a reply can be several messages); filled for the turns already recorded.
ALTER TABLE public.voice_lounge_turn_updates ADD COLUMN IF NOT EXISTS message_id bigint;
UPDATE public.voice_lounge_turn_updates t SET message_id=(
  SELECT min(m.id) FROM public.voice_lounge_messages m WHERE m.room_id=t.room_id AND m.kind='host' AND m.text=t.reply)
WHERE t.message_id IS NULL;
CREATE INDEX IF NOT EXISTS voice_lounge_turn_updates_message ON public.voice_lounge_turn_updates(room_id,message_id);

CREATE OR REPLACE FUNCTION public.queue_voice_lounge_turn() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; said text;
BEGIN
 SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=NEW.room_id AND companion_chat;
 IF FOUND THEN
  SELECT text INTO said FROM public.voice_lounge_messages WHERE room_id=NEW.room_id AND kind='human' AND id<NEW.id AND id>coalesce((SELECT max(id) FROM public.voice_lounge_messages WHERE room_id=NEW.room_id AND kind='host' AND id<NEW.id),0) ORDER BY id DESC LIMIT 1;
  INSERT INTO public.voice_lounge_turn_updates(room_id,turn,user_id,character_id,user_text,reply,message_id) VALUES(r.id,r.ai_turns,r.host_id,r.host_persona,coalesce(said,''),NEW.text,NEW.id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;

-- What a turn's commit is about to change, kept before it changes it. Only the server reads and writes it.
CREATE TABLE IF NOT EXISTS public.voice_lounge_turn_snapshots(
 room_id text NOT NULL REFERENCES public.voice_lounge_rooms(id) ON DELETE CASCADE,
 turn integer NOT NULL CHECK(turn>=0),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 character_id text NOT NULL,
 room jsonb NOT NULL,
 companion jsonb,
 relationship jsonb,
 memories jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(room_id,turn));
ALTER TABLE public.voice_lounge_turn_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.voice_lounge_turn_snapshots FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.voice_lounge_turn_snapshots TO service_role;

-- As in 20261208000000_lounge_room_state.sql, keeping a snapshot first (and only the last 30 turns' snapshots of the room).
CREATE OR REPLACE FUNCTION public.commit_voice_lounge_turn(p_user uuid,p_character text,p_room text,p_turn integer,p_relationship_version integer,p_state_version integer,p_relationship jsonb,p_mood jsonb,p_state jsonb,p_memory text,p_memory_ops jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; job public.voice_lounge_turn_updates; relationship_version integer; state_version integer;
BEGIN
 SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room AND host_id=p_user AND host_persona=p_character AND companion_chat FOR UPDATE;
 IF NOT FOUND THEN RETURN 'missing'; END IF;
 SELECT * INTO job FROM public.voice_lounge_turn_updates WHERE room_id=p_room AND turn=p_turn FOR UPDATE;
 IF NOT FOUND THEN RETURN 'missing'; END IF;
 IF job.status='applied' THEN RETURN 'applied'; END IF;
 IF job.status<>'ready' OR EXISTS(SELECT 1 FROM public.voice_lounge_turn_updates WHERE room_id=p_room AND turn<p_turn AND status<>'applied') THEN RETURN 'blocked'; END IF;
 SELECT version INTO relationship_version FROM public.voice_lounge_relationships WHERE user_id=p_user AND character_id=p_character FOR UPDATE;
 SELECT version INTO state_version FROM public.voice_lounge_companion_state WHERE user_id=p_user AND character_id=p_character FOR UPDATE;
 IF coalesce(relationship_version,0)<>p_relationship_version OR coalesce(state_version,0)<>p_state_version THEN RETURN 'conflict'; END IF;
 INSERT INTO public.voice_lounge_turn_snapshots(room_id,turn,user_id,character_id,room,companion,relationship,memories)
 VALUES(p_room,p_turn,p_user,p_character,
  jsonb_build_object('memory',r.memory,'memory_turn',r.memory_turn,'ai_mood',r.ai_mood,'story_state',r.story_state),
  (SELECT jsonb_build_object('state',s.state,'processed_turn',s.processed_turn,'room_id',s.room_id) FROM public.voice_lounge_companion_state s WHERE s.user_id=p_user AND s.character_id=p_character),
  (SELECT to_jsonb(x) FROM public.voice_lounge_relationships x WHERE x.user_id=p_user AND x.character_id=p_character),
  coalesce((SELECT jsonb_agg(to_jsonb(m)-'embedding') FROM public.voice_lounge_memories m WHERE m.user_id=p_user AND m.character_id=p_character),'[]'::jsonb))
 ON CONFLICT(room_id,turn) DO NOTHING;
 DELETE FROM public.voice_lounge_turn_snapshots WHERE room_id=p_room AND turn<p_turn-30;
 IF p_relationship IS NOT NULL THEN
  relationship_version:=public.save_voice_lounge_relationship(p_user,p_character,p_room,p_relationship_version,p_relationship,p_mood);
  IF relationship_version IS NULL THEN RAISE EXCEPTION 'relationship commit failed'; END IF;
 END IF;
 IF p_state IS NOT NULL THEN
  IF p_state->>'room_id' IS DISTINCT FROM p_room OR (p_state->>'source_turn')::integer IS DISTINCT FROM p_turn THEN RAISE EXCEPTION 'invalid companion state'; END IF;
  INSERT INTO public.voice_lounge_companion_state(user_id,character_id,room_id,state,version,processed_turn) VALUES(p_user,p_character,p_room,p_state,coalesce(state_version,0)+1,p_turn)
  ON CONFLICT(user_id,character_id) DO UPDATE SET state=EXCLUDED.state,version=EXCLUDED.version,processed_turn=p_turn,room_id=p_room,updated_at=now();
 END IF;
 IF p_memory IS NOT NULL AND btrim(p_memory)<>'' AND p_turn>=coalesce(r.memory_turn,0) THEN UPDATE public.voice_lounge_rooms SET memory=left(p_memory,1800),memory_turn=p_turn WHERE id=p_room; END IF;
 IF p_memory_ops IS NOT NULL THEN PERFORM public.apply_voice_lounge_memory_ops(p_user,p_character,p_room,p_memory_ops); END IF;
 UPDATE public.voice_lounge_turn_updates SET status='applied',payload='{}'::jsonb,updated_at=now() WHERE room_id=p_room AND turn=p_turn;
 RETURN 'saved';
END $$;
REVOKE ALL ON FUNCTION public.commit_voice_lounge_turn(uuid,text,text,integer,integer,integer,jsonb,jsonb,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_voice_lounge_turn(uuid,text,text,integer,integer,integer,jsonb,jsonb,jsonb,text,jsonb) TO service_role;

-- A voice made for a message (음성으로 듣기): the file, the words it says and how long it is. Removed with its message.
CREATE TABLE IF NOT EXISTS public.lounge_message_voices(
 message_id bigint PRIMARY KEY REFERENCES public.voice_lounge_messages(id) ON DELETE CASCADE,
 room_id text NOT NULL REFERENCES public.voice_lounge_rooms(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 path text NOT NULL,
 text text NOT NULL,
 seconds numeric(8,2) NOT NULL CHECK(seconds>=0),
 created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.lounge_message_voices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_message_voices FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.lounge_message_voices TO service_role;

-- The month's seconds of message voices per member (the month in Korea). A voice heard again is not counted again, and a voice
-- whose message was removed stays counted.
CREATE TABLE IF NOT EXISTS public.lounge_message_voice_usage(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 month date NOT NULL,
 seconds numeric(10,2) NOT NULL DEFAULT 0 CHECK(seconds>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,month));
ALTER TABLE public.lounge_message_voice_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_message_voice_usage FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.lounge_message_voice_usage TO service_role;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('lounge-message-voices','lounge-message-voices',false,5242880,ARRAY['audio/mpeg'])
ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.lounge_message_voice_status(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'seconds',coalesce((SELECT seconds FROM public.lounge_message_voice_usage WHERE user_id=p_user AND month=public.lounge_speech_month()),0),
    'plan',public.lounge_active_plan(p_user),
    'exempt',public.lounge_call_exempt(p_user))
$$;
REVOKE ALL ON FUNCTION public.lounge_message_voice_status(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lounge_message_voice_status(uuid) TO service_role;

-- Keeps a message's voice and counts it, once: a second voice for the same message (two taps at once) is not counted, and the
-- one kept is returned.
CREATE OR REPLACE FUNCTION public.record_lounge_message_voice(p_user uuid,p_room text,p_message bigint,p_path text,p_text text,p_seconds numeric) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE kept public.lounge_message_voices; fresh boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.voice_lounge_messages m JOIN public.voice_lounge_rooms r ON r.id=m.room_id
   WHERE m.id=p_message AND m.room_id=p_room AND m.kind='host' AND r.host_id=p_user AND r.capacity=1 AND r.space_id IS NULL) THEN RETURN NULL; END IF;
 INSERT INTO public.lounge_message_voices(message_id,room_id,user_id,path,text,seconds) VALUES(p_message,p_room,p_user,p_path,left(p_text,3000),greatest(p_seconds,0))
 ON CONFLICT(message_id) DO NOTHING RETURNING true INTO fresh;
 IF coalesce(fresh,false) THEN
  INSERT INTO public.lounge_message_voice_usage(user_id,month,seconds) VALUES(p_user,public.lounge_speech_month(),greatest(p_seconds,0))
  ON CONFLICT(user_id,month) DO UPDATE SET seconds=public.lounge_message_voice_usage.seconds+EXCLUDED.seconds,updated_at=now();
 END IF;
 SELECT * INTO kept FROM public.lounge_message_voices WHERE message_id=p_message;
 RETURN jsonb_build_object('path',kept.path,'seconds',kept.seconds,'fresh',coalesce(fresh,false),
   'used',coalesce((SELECT seconds FROM public.lounge_message_voice_usage WHERE user_id=p_user AND month=public.lounge_speech_month()),0));
END $$;
REVOKE ALL ON FUNCTION public.record_lounge_message_voice(uuid,text,bigint,text,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_lounge_message_voice(uuid,text,bigint,text,text,numeric) TO service_role;

-- Goes back to before a message of the member's own one-to-one chat (one of its last 10). Returns
--   {state:'done', from, removed, voices:[paths]}  the messages from `from` on are gone and the state is as it was before them,
--   {state:'busy'}     a reply is being written or recorded; try again in a moment,
--   {state:'denied'}   not this member's chat, or not one of the last 10 messages.
-- A reply split over several messages goes back from its first one. p_consult: 홍실당's state is saved before its reply, so it is
-- taken from the turn before instead.
CREATE OR REPLACE FUNCTION public.rewind_voice_lounge_chat(p_user uuid,p_room text,p_message bigint,p_consult boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; target public.voice_lounge_messages; cut_from bigint; cut_turn integer; first_host bigint;
 snap public.voice_lounge_turn_snapshots; before_snap public.voice_lounge_turn_snapshots; cut_at timestamptz; removed integer; voice_paths jsonb;
BEGIN
 SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
 IF NOT FOUND OR r.host_id<>p_user OR r.capacity<>1 OR r.space_id IS NOT NULL OR NOT r.companion_chat THEN RETURN jsonb_build_object('state','denied'); END IF;
 IF r.ai_ticket IS NOT NULL AND r.ai_ticket_at>now()-interval '15 seconds' THEN RETURN jsonb_build_object('state','busy'); END IF;
 IF EXISTS(SELECT 1 FROM public.voice_lounge_turn_updates WHERE room_id=p_room AND status<>'applied' AND updated_at>now()-interval '90 seconds') THEN RETURN jsonb_build_object('state','busy'); END IF;
 SELECT * INTO target FROM public.voice_lounge_messages WHERE id=p_message AND room_id=p_room;
 IF NOT FOUND OR target.kind NOT IN ('host','human') OR target.id NOT IN (SELECT id FROM public.voice_lounge_messages WHERE room_id=p_room AND kind IN ('host','human') ORDER BY id DESC LIMIT 10) THEN
  RETURN jsonb_build_object('state','denied');
 END IF;
 cut_from:=target.id;
 -- A later part of a split reply: back to the reply's first message.
 IF target.kind='host' THEN
  SELECT max(m.id) INTO first_host FROM public.voice_lounge_messages m WHERE m.room_id=p_room AND m.id<=target.id
   AND m.id>coalesce((SELECT max(h.id) FROM public.voice_lounge_messages h WHERE h.room_id=p_room AND h.kind='human' AND h.id<target.id),0)
   AND m.id IN (SELECT message_id FROM public.voice_lounge_turn_updates WHERE room_id=p_room AND message_id IS NOT NULL);
  IF first_host IS NOT NULL THEN cut_from:=first_host; END IF;
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
REVOKE ALL ON FUNCTION public.rewind_voice_lounge_chat(uuid,text,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rewind_voice_lounge_chat(uuid,text,bigint,boolean) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
