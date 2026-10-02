-- Apply after the lounge themes and unlimited creation migrations.
BEGIN;
ALTER TABLE public.voice_lounge_rooms
  ADD COLUMN IF NOT EXISTS study_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS topic_study jsonb,
  ADD COLUMN IF NOT EXISTS study_ticket uuid,
  ADD COLUMN IF NOT EXISTS study_ticket_at timestamptz,
  ADD COLUMN IF NOT EXISTS study_attempts integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.create_voice_lounge(
  p_persona text, p_topic text, p_capacity integer, p_nickname text, p_theme text, p_study_required boolean
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE room_id text;
BEGIN
  room_id := public.create_voice_lounge(p_persona,p_topic,p_capacity,p_nickname,p_theme);
  UPDATE public.voice_lounge_rooms SET study_required=coalesce(p_study_required,false) WHERE id=room_id;
  RETURN room_id;
END $$;

-- A separate ticket keeps search latency out of the moderator's 60-second ticket.
CREATE OR REPLACE FUNCTION public.claim_voice_lounge_study(p_room text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; ticket uuid;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.host_id IS DISTINCT FROM auth.uid() OR NOT public.is_voice_lounge_member(p_room)
    OR r.status='ended' OR coalesce(r.expires_at,r.created_at+interval '2 hours')<=now() THEN RETURN NULL; END IF;
  IF NOT r.study_required THEN RETURN jsonb_build_object('state','skipped'); END IF;
  IF r.topic_study IS NOT NULL THEN RETURN jsonb_build_object('state','ready','study',r.topic_study); END IF;
  IF (r.study_ticket IS NOT NULL AND r.study_ticket_at>now()-interval '90 seconds')
    OR r.study_ticket_at>now()-interval '60 seconds' THEN RETURN jsonb_build_object('state','busy'); END IF;
  IF r.study_attempts>=3 THEN RETURN jsonb_build_object('state','exhausted'); END IF;
  ticket:=gen_random_uuid();
  UPDATE public.voice_lounge_rooms SET study_ticket=ticket,study_ticket_at=now(),study_attempts=study_attempts+1 WHERE id=p_room;
  RETURN jsonb_build_object('state','claimed','ticket',ticket,'topic',r.topic);
END $$;

CREATE OR REPLACE FUNCTION public.finish_voice_lounge_study(p_room text,p_ticket uuid,p_study jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_study IS NULL OR jsonb_typeof(p_study)<>'object' OR octet_length(p_study::text)>24000 THEN RETURN false; END IF;
  IF NOT (p_study ?& ARRAY['title','confidence','overview','facts','angles','questions','clarification','sources'])
    OR p_study->>'confidence' NOT IN ('verified','uncertain')
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['title','confidence','overview','clarification']) k WHERE jsonb_typeof(p_study->k)<>'string')
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['facts','angles','questions','sources']) k WHERE jsonb_typeof(p_study->k)<>'array') THEN RETURN false; END IF;
  IF jsonb_array_length(p_study->'sources')>8
    OR EXISTS (SELECT 1 FROM jsonb_array_elements((p_study->'facts')||(p_study->'angles')||(p_study->'questions')) v WHERE jsonb_typeof(v)<>'string')
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_study->'sources') v WHERE jsonb_typeof(v)<>'object'
      OR NOT (v ?& ARRAY['title','url']) OR jsonb_typeof(v->'title')<>'string' OR jsonb_typeof(v->'url')<>'string'
      OR v->>'url' !~ '^https?://') THEN RETURN false; END IF;
  UPDATE public.voice_lounge_rooms SET topic_study=p_study,study_ticket=NULL
    WHERE id=p_room AND host_id=auth.uid() AND public.is_voice_lounge_member(p_room)
    AND status<>'ended' AND coalesce(expires_at,created_at+interval '2 hours')>now()
    AND study_ticket=p_ticket AND study_ticket_at>now()-interval '90 seconds' AND topic_study IS NULL;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.fail_voice_lounge_study(p_room text,p_ticket uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE public.voice_lounge_rooms SET study_ticket=NULL
    WHERE id=p_room AND host_id=auth.uid() AND public.is_voice_lounge_member(p_room) AND study_ticket=p_ticket;
$$;

REVOKE ALL ON FUNCTION public.create_voice_lounge(text,text,integer,text,text,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.claim_voice_lounge_study(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.finish_voice_lounge_study(text,uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fail_voice_lounge_study(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_voice_lounge(text,text,integer,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_voice_lounge_study(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_voice_lounge_study(text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_voice_lounge_study(text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
