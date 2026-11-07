-- One continuing companion chat per member and character; deleting it resets its context.
BEGIN;
ALTER TABLE public.voice_lounge_rooms ADD COLUMN IF NOT EXISTS companion_chat boolean NOT NULL DEFAULT false;
WITH chosen AS (
 SELECT DISTINCT ON(host_id,host_persona) id FROM public.voice_lounge_rooms r WHERE capacity=1 AND space_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM public.voice_lounge_rooms c WHERE c.host_id=r.host_id AND c.host_persona=r.host_persona AND c.companion_chat)
 ORDER BY host_id,host_persona,created_at DESC,id DESC
) UPDATE public.voice_lounge_rooms SET companion_chat=true WHERE id IN(SELECT id FROM chosen);
CREATE UNIQUE INDEX IF NOT EXISTS voice_lounge_one_companion_chat ON public.voice_lounge_rooms(host_id,host_persona) WHERE companion_chat;
UPDATE public.voice_lounge_rooms SET status='ended',ai_ticket=NULL,ai_ticket_at=NULL WHERE capacity=1 AND space_id IS NULL AND NOT companion_chat AND status<>'ended';
ALTER TABLE public.voice_lounge_rooms DROP CONSTRAINT IF EXISTS voice_lounge_companion_private;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_companion_private CHECK(NOT companion_chat OR(capacity=1 AND space_id IS NULL));
ALTER TABLE public.voice_lounge_relationships ADD COLUMN IF NOT EXISTS room_id text REFERENCES public.voice_lounge_rooms(id) ON DELETE CASCADE;
ALTER TABLE public.voice_lounge_companion_state ADD COLUMN IF NOT EXISTS room_id text REFERENCES public.voice_lounge_rooms(id) ON DELETE CASCADE,
 ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS processed_turn integer NOT NULL DEFAULT 0;
-- Bounded evidence-backed memories need more room than the old scene-only 32 KB state.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.voice_lounge_companion_state'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%pg_column_size%' LOOP
  EXECUTE format('ALTER TABLE public.voice_lounge_companion_state DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE public.voice_lounge_companion_state ADD CONSTRAINT voice_lounge_companion_state_size_check CHECK(jsonb_typeof(state)='object' AND pg_column_size(state)<=131072);
ALTER TABLE public.voice_lounge_relationship_milestones ADD COLUMN IF NOT EXISTS room_id text REFERENCES public.voice_lounge_rooms(id) ON DELETE CASCADE;
UPDATE public.voice_lounge_relationships x SET room_id=r.id FROM public.voice_lounge_rooms r WHERE r.companion_chat AND r.host_id=x.user_id AND r.host_persona=x.character_id AND x.room_id IS NULL;
UPDATE public.voice_lounge_relationship_milestones x SET room_id=r.id FROM public.voice_lounge_rooms r WHERE r.companion_chat AND r.host_id=x.user_id AND r.host_persona=x.character_id AND x.room_id IS NULL;
UPDATE public.voice_lounge_companion_state x SET room_id=r.id,state=CASE WHEN x.state->>'room_id'=r.id THEN x.state ELSE jsonb_build_object('room_id',r.id) END,
 processed_turn=coalesce(r.ai_turns,0) FROM public.voice_lounge_rooms r WHERE r.companion_chat AND r.host_id=x.user_id AND r.host_persona=x.character_id AND x.room_id IS NULL;
-- Preserve legacy memory in the canonical continuing conversation, never copy to future chats.
UPDATE public.voice_lounge_memories x SET source_room=r.id FROM public.voice_lounge_rooms r WHERE r.companion_chat AND r.host_id=x.user_id AND r.host_persona=x.character_id AND x.source_room IS DISTINCT FROM r.id;
UPDATE public.voice_lounge_memories SET source_room=NULL WHERE source_room IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.voice_lounge_rooms r WHERE r.id=source_room);
ALTER TABLE public.voice_lounge_memories DROP CONSTRAINT IF EXISTS voice_lounge_memories_room_fk;
ALTER TABLE public.voice_lounge_memories ADD CONSTRAINT voice_lounge_memories_room_fk FOREIGN KEY(source_room) REFERENCES public.voice_lounge_rooms(id) ON DELETE CASCADE;
CREATE OR REPLACE FUNCTION public.bind_voice_lounge_companion_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.room_id IS NULL THEN SELECT id INTO NEW.room_id FROM public.voice_lounge_rooms WHERE host_id=NEW.user_id AND host_persona=NEW.character_id AND companion_chat; END IF;
 IF NEW.room_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.voice_lounge_rooms r WHERE r.id=NEW.room_id AND r.host_id=NEW.user_id AND r.host_persona=NEW.character_id AND r.companion_chat) THEN RAISE EXCEPTION 'invalid companion room'; END IF;
 IF TG_TABLE_NAME='voice_lounge_companion_state' THEN
  IF NEW.state->>'room_id' IS DISTINCT FROM NEW.room_id THEN RAISE EXCEPTION 'stale companion room'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bind_companion_relationship ON public.voice_lounge_relationships;
CREATE TRIGGER bind_companion_relationship BEFORE INSERT OR UPDATE ON public.voice_lounge_relationships FOR EACH ROW EXECUTE FUNCTION public.bind_voice_lounge_companion_record();
DROP TRIGGER IF EXISTS bind_companion_state ON public.voice_lounge_companion_state;
CREATE TRIGGER bind_companion_state BEFORE INSERT OR UPDATE ON public.voice_lounge_companion_state FOR EACH ROW EXECUTE FUNCTION public.bind_voice_lounge_companion_record();
DROP TRIGGER IF EXISTS bind_companion_milestone ON public.voice_lounge_relationship_milestones;
CREATE TRIGGER bind_companion_milestone BEFORE INSERT ON public.voice_lounge_relationship_milestones FOR EACH ROW EXECUTE FUNCTION public.bind_voice_lounge_companion_record();
-- Old deployments also serialize their writers with room deletion, and cannot
-- write from an archived duplicate room during a rolling deployment.
-- The text patch must actually apply (or already be applied); a silent no-op would leave the guard out.
DO $$ DECLARE signature text; definition text; patched text; BEGIN
 FOREACH signature IN ARRAY ARRAY['public.save_voice_lounge_relationship(uuid,text,text,integer,jsonb,jsonb)', 'public.apply_voice_lounge_memory_ops(uuid,text,text,jsonb)'] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
  patched:=replace(definition,'SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room;',
    'SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room AND companion_chat FOR UPDATE;');
  IF patched=definition AND position('WHERE id=p_room AND companion_chat FOR UPDATE;' IN definition)=0 THEN RAISE EXCEPTION 'could not patch %: its room lookup was not found', signature; END IF;
  IF patched<>definition THEN EXECUTE patched; END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.resume_lounge_chat(p_room text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; picked text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
 SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room AND host_id=auth.uid() AND capacity=1 AND space_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION '이어갈 수 없는 대화예요.'; END IF;
 SELECT id INTO picked FROM public.voice_lounge_rooms WHERE host_id=auth.uid() AND host_persona=r.host_persona AND companion_chat FOR UPDATE;
 IF picked IS NULL THEN RAISE EXCEPTION '삭제된 대화예요. 새로 시작해 주세요.'; END IF;
 UPDATE public.voice_lounge_rooms SET status=CASE WHEN status='lobby' THEN 'lobby' ELSE 'active' END,expires_at=greatest(coalesce(expires_at,now()),now()+interval '1 hour'),voice_on=false WHERE id=picked;
 UPDATE public.voice_lounge_members SET active=true,last_seen=now() WHERE room_id=picked AND user_id=auth.uid();
 RETURN picked;
END $$;
CREATE OR REPLACE FUNCTION public.create_voice_lounge(p_persona text,p_topic text,p_capacity integer,p_nickname text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE picked text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
 IF p_capacity=1 THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
  SELECT id INTO picked FROM public.voice_lounge_rooms WHERE host_id=auth.uid() AND host_persona=p_persona AND companion_chat FOR UPDATE;
  IF picked IS NOT NULL THEN RETURN public.resume_lounge_chat(picked); END IF;
  DELETE FROM public.voice_lounge_relationships WHERE user_id=auth.uid() AND character_id=p_persona;
  DELETE FROM public.voice_lounge_memories WHERE user_id=auth.uid() AND character_id=p_persona;
  DELETE FROM public.voice_lounge_companion_state WHERE user_id=auth.uid() AND character_id=p_persona;
  DELETE FROM public.voice_lounge_relationship_milestones WHERE user_id=auth.uid() AND character_id=p_persona;
 END IF;
 INSERT INTO public.voice_lounge_rooms(host_id,host_persona,topic,capacity,companion_chat) VALUES(auth.uid(),p_persona,trim(p_topic),p_capacity,p_capacity=1) RETURNING id INTO picked;
 INSERT INTO public.voice_lounge_members(room_id,user_id,nickname) VALUES(picked,auth.uid(),left(trim(p_nickname),30));
 RETURN picked;
END $$;
-- Preserve all themed/study creation overloads, but don't rewrite an ongoing chat.
DO $$ DECLARE f record; definition text; patched text; BEGIN
 FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='create_voice_lounge' AND pronargs>4 LOOP
  definition:=pg_get_functiondef(f.oid);
  patched:=replace(definition,'WHERE id = room_id AND host_id = auth.uid();','WHERE id = room_id AND host_id = auth.uid() AND (NOT companion_chat OR ai_turns=0);');
  patched:=replace(patched,'WHERE id=room_id AND host_id=auth.uid();','WHERE id=room_id AND host_id=auth.uid() AND (NOT companion_chat OR ai_turns=0);');
  patched:=replace(patched,'WHERE id=room_id;','WHERE id=room_id AND (NOT companion_chat OR ai_turns=0);');
  IF patched=definition AND position('NOT companion_chat OR ai_turns=0' IN definition)=0 THEN RAISE EXCEPTION 'could not patch create_voice_lounge (oid %): its room update was not found', f.oid; END IF;
  IF patched<>definition THEN EXECUTE patched; END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.start_lounge_scenario(p_scenario text,p_nickname text,p_note text DEFAULT NULL,p_fresh boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.lounge_scenarios; picked text; copy jsonb; note text:=left(btrim(coalesce(p_note,'')),2000);
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
 SELECT * INTO s FROM public.lounge_scenarios WHERE id=p_scenario AND active;
 IF NOT FOUND THEN RAISE EXCEPTION '지금은 시작할 수 없는 이야기예요.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
 SELECT id INTO picked FROM public.voice_lounge_rooms WHERE host_id=auth.uid() AND host_persona=s.character_id AND companion_chat FOR UPDATE;
 IF picked IS NOT NULL THEN
  IF coalesce(p_fresh,false) THEN RAISE EXCEPTION '처음부터 시작하려면 기존 채팅을 삭제해 주세요. 기억과 관계도 함께 초기화됩니다.'; END IF;
  RETURN public.resume_lounge_chat(picked);
 END IF;
 picked:=public.create_voice_lounge(s.character_id,s.title,1,p_nickname,s.theme);
 copy:=jsonb_build_object('id',s.id,'title',s.title,'prologue',s.prologue,'user_role',s.user_role,'relationship',s.relationship,'place',s.place);
 IF note<>'' THEN copy:=copy||jsonb_build_object('member_note',note); END IF;
 UPDATE public.voice_lounge_rooms SET scenario=copy WHERE id=picked;
 RETURN picked;
END $$;
-- (The old 2-argument start_lounge_scenario is not recreated: the 4-argument one has defaults, and a second overload makes a call with only p_scenario and p_nickname ambiguous.)
DROP FUNCTION IF EXISTS public.start_lounge_scenario(text, text);
CREATE OR REPLACE FUNCTION public.start_lounge_custom_chat(p_character text,p_nickname text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.lounge_custom_characters; picked text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
 SELECT * INTO c FROM public.lounge_custom_characters WHERE id=p_character AND(owner_id=auth.uid() OR status='public');
 IF NOT FOUND OR c.portrait_path IS NULL THEN RAISE EXCEPTION '대화할 수 없는 캐릭터예요.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
 SELECT id INTO picked FROM public.voice_lounge_rooms WHERE host_id=auth.uid() AND host_persona=p_character AND companion_chat FOR UPDATE;
 IF picked IS NOT NULL THEN RETURN public.resume_lounge_chat(picked); END IF;
 picked:=public.create_voice_lounge(p_character,'둘이서 편하게 이야기해요',1,p_nickname,c.theme);
 IF length(btrim(coalesce(c.sheet->>'prologue','')))>=20 THEN
  UPDATE public.voice_lounge_rooms SET scenario=jsonb_build_object('id','custom-story','title',left(c.name||'와(과)의 이야기',40),'prologue',left(btrim(c.sheet->>'prologue'),12000),'user_role',left(btrim(coalesce(c.sheet->>'userRole','')),120),'relationship',left(btrim(coalesce(c.sheet->>'storyRelationship','')),200),'place','') WHERE id=picked;
 END IF;
 RETURN picked;
END $$;
CREATE OR REPLACE FUNCTION public.delete_lounge_chat(p_room text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
 SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room AND host_id=auth.uid() AND companion_chat FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 DELETE FROM public.voice_lounge_rooms WHERE host_id=auth.uid() AND host_persona=r.host_persona AND capacity=1 AND space_id IS NULL;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.delete_lounge_chat(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_lounge_chat(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.delete_voice_lounge_companion_context() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.companion_chat THEN
  DELETE FROM public.voice_lounge_relationships WHERE user_id=OLD.host_id AND character_id=OLD.host_persona;
  DELETE FROM public.voice_lounge_memories WHERE user_id=OLD.host_id AND character_id=OLD.host_persona;
  DELETE FROM public.voice_lounge_companion_state WHERE user_id=OLD.host_id AND character_id=OLD.host_persona;
  DELETE FROM public.voice_lounge_relationship_milestones WHERE user_id=OLD.host_id AND character_id=OLD.host_persona;
 END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS delete_companion_context ON public.voice_lounge_rooms;
CREATE TRIGGER delete_companion_context BEFORE DELETE ON public.voice_lounge_rooms FOR EACH ROW EXECUTE FUNCTION public.delete_voice_lounge_companion_context();
CREATE OR REPLACE FUNCTION public.list_my_lounge_chats() RETURNS TABLE(room_id text,character_id text,story text,last_text text,last_kind text,last_at timestamptz,open boolean,character_name text,character_portrait text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT r.id,r.host_persona,r.scenario->>'title',coalesce(last.text,''),coalesce(last.kind,'host'),coalesce(last.created_at,r.created_at),r.status IN('lobby','active') AND coalesce(r.expires_at,r.created_at+interval '2 hours')>now(),c.name,c.portrait_path
 FROM public.voice_lounge_rooms r LEFT JOIN LATERAL(SELECT m.text,m.kind,m.created_at FROM public.voice_lounge_messages m WHERE m.room_id=r.id ORDER BY m.id DESC LIMIT 1) last ON true
 LEFT JOIN public.lounge_custom_characters c ON c.id=r.host_persona AND(c.owner_id=auth.uid() OR c.status='public') WHERE r.host_id=auth.uid() AND r.companion_chat ORDER BY coalesce(last.created_at,r.created_at) DESC LIMIT 100
$$;
DO $$ DECLARE definition text; patched text; BEGIN
 SELECT pg_get_functiondef('public.claim_voice_lounge_host(text,text)'::regprocedure) INTO definition;
 patched:=replace(definition,'OR r.ai_turns>=120','OR (r.ai_turns>=120 AND NOT r.companion_chat)');
 IF patched=definition AND position('r.ai_turns>=120 AND NOT r.companion_chat' IN definition)=0 THEN RAISE EXCEPTION 'could not patch claim_voice_lounge_host: its turn limit was not found'; END IF;
 IF patched<>definition THEN EXECUTE patched; END IF;
END $$;
-- Ordered, durable post-reply ledger. Reply insertion and the pending marker are atomic.
CREATE TABLE IF NOT EXISTS public.voice_lounge_turn_updates(
 room_id text NOT NULL REFERENCES public.voice_lounge_rooms(id) ON DELETE CASCADE,turn integer NOT NULL CHECK(turn>=0),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,character_id text NOT NULL,user_text text NOT NULL DEFAULT '',reply text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','ready','applied')),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(payload)='object' AND pg_column_size(payload)<=131072),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(room_id,turn));
ALTER TABLE public.voice_lounge_turn_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.voice_lounge_turn_updates FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.voice_lounge_turn_updates TO service_role;
CREATE INDEX IF NOT EXISTS voice_lounge_pending_turns ON public.voice_lounge_turn_updates(room_id,turn) WHERE status<>'applied';
CREATE OR REPLACE FUNCTION public.queue_voice_lounge_turn() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; said text;
BEGIN
 SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=NEW.room_id AND companion_chat;
 IF FOUND THEN
  SELECT text INTO said FROM public.voice_lounge_messages WHERE room_id=NEW.room_id AND kind='human' AND id<NEW.id AND id>coalesce((SELECT max(id) FROM public.voice_lounge_messages WHERE room_id=NEW.room_id AND kind='host' AND id<NEW.id),0) ORDER BY id DESC LIMIT 1;
  INSERT INTO public.voice_lounge_turn_updates(room_id,turn,user_id,character_id,user_text,reply) VALUES(r.id,r.ai_turns,r.host_id,r.host_persona,coalesce(said,''),NEW.text) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS queue_companion_turn ON public.voice_lounge_messages;
CREATE TRIGGER queue_companion_turn AFTER INSERT ON public.voice_lounge_messages FOR EACH ROW WHEN(NEW.kind='host') EXECUTE FUNCTION public.queue_voice_lounge_turn();
CREATE OR REPLACE FUNCTION public.prepare_voice_lounge_turn(p_user uuid,p_character text,p_room text,p_turn integer,p_payload jsonb,p_ready boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.voice_lounge_rooms WHERE id=p_room AND host_id=p_user AND host_persona=p_character AND companion_chat FOR UPDATE;
 IF NOT FOUND OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 UPDATE public.voice_lounge_turn_updates SET payload=p_payload,status=CASE WHEN p_ready THEN 'ready' ELSE 'pending' END,updated_at=now() WHERE room_id=p_room AND turn=p_turn AND user_id=p_user AND character_id=p_character AND status='pending';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.prepare_voice_lounge_turn(uuid,text,text,integer,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_voice_lounge_turn(uuid,text,text,integer,jsonb,boolean) TO service_role;
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
CREATE OR REPLACE FUNCTION public.bind_voice_lounge_memory_room() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.source_room IS NULL THEN SELECT id INTO NEW.source_room FROM public.voice_lounge_rooms WHERE host_id=NEW.user_id AND host_persona=NEW.character_id AND companion_chat; END IF;
 IF NEW.source_room IS NULL OR NOT EXISTS(SELECT 1 FROM public.voice_lounge_rooms WHERE id=NEW.source_room AND host_id=NEW.user_id AND host_persona=NEW.character_id AND companion_chat) THEN RAISE EXCEPTION '기억을 남길 대화를 먼저 시작해 주세요.'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bind_companion_memory ON public.voice_lounge_memories;
CREATE TRIGGER bind_companion_memory BEFORE INSERT OR UPDATE OF source_room ON public.voice_lounge_memories FOR EACH ROW EXECUTE FUNCTION public.bind_voice_lounge_memory_room();
CREATE OR REPLACE FUNCTION public.get_my_lounge_memory(p_character text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
  'memories',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'summary',m.summary,'follow_up',m.follow_up,'importance',m.importance,'created_at',m.created_at,'updated_at',m.updated_at) ORDER BY m.kind='open_thread' DESC,m.importance DESC,m.updated_at DESC) FROM public.voice_lounge_memories m WHERE m.user_id=auth.uid() AND m.character_id=p_character AND m.source_room=r.id AND m.status='active'),'[]'::jsonb),
  'conversation',coalesce((SELECT state->'room_memory' FROM public.voice_lounge_companion_state s WHERE s.user_id=auth.uid() AND s.character_id=p_character AND s.room_id=r.id),'[]'::jsonb),
  'relationship',(SELECT jsonb_build_object('stage',x.stage,'events',x.memories,'started_at',x.created_at,'turn_count',x.turn_count,'last_at',x.last_interaction_at) FROM public.voice_lounge_relationships x WHERE x.user_id=auth.uid() AND x.character_id=p_character AND x.room_id=r.id),
  'milestones',coalesce((SELECT jsonb_agg(jsonb_build_object('from',x.from_stage,'to',x.to_stage,'at',x.created_at) ORDER BY x.created_at) FROM public.voice_lounge_relationship_milestones x WHERE x.user_id=auth.uid() AND x.character_id=p_character AND x.room_id=r.id),'[]'::jsonb),'limit',40)
 FROM public.voice_lounge_rooms r WHERE r.host_id=auth.uid() AND r.host_persona=p_character AND r.companion_chat
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
