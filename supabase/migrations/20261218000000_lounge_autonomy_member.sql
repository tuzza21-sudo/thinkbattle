-- Per-member autonomy overrides (personality / goals / ambient) on voice_lounge_companion_state.
-- Kindroid-style: only this member's chat with this character is affected.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_lounge_autonomy(p_character text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_id text;
  a jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요해요.'; END IF;
  IF p_character IS NULL OR length(trim(p_character)) = 0 THEN RAISE EXCEPTION '캐릭터가 없어요.'; END IF;
  SELECT id INTO r_id FROM public.voice_lounge_rooms
   WHERE host_id = auth.uid() AND host_persona = p_character AND companion_chat
   ORDER BY created_at DESC LIMIT 1;
  IF r_id IS NULL THEN RETURN NULL; END IF;
  SELECT state->'autonomy' INTO a FROM public.voice_lounge_companion_state
   WHERE user_id = auth.uid() AND character_id = p_character;
  RETURN jsonb_build_object(
    'room_id', r_id,
    'autonomy', coalesce(a, '{}'::jsonb),
    'member', coalesce(a->'member', '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_lounge_autonomy(p_character text, p_member jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_id text;
  cur jsonb;
  autonomy jsonb;
  member jsonb := '{}'::jsonb;
  personality text;
  core_drive text;
  current_intention text;
  ambient text;
  mood_hint text;
  goals jsonb := '[]'::jsonb;
  item text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요해요.'; END IF;
  IF p_character IS NULL OR length(trim(p_character)) = 0 THEN RAISE EXCEPTION '캐릭터가 없어요.'; END IF;
  SELECT id INTO r_id FROM public.voice_lounge_rooms
   WHERE host_id = auth.uid() AND host_persona = p_character AND companion_chat
   ORDER BY created_at DESC LIMIT 1;
  IF r_id IS NULL THEN RAISE EXCEPTION '대화를 먼저 시작해 주세요.'; END IF;

  personality := nullif(left(trim(coalesce(p_member->>'personality','')), 400), '');
  core_drive := nullif(left(trim(coalesce(p_member->>'core_drive','')), 120), '');
  current_intention := nullif(left(trim(coalesce(p_member->>'current_intention','')), 80), '');
  ambient := nullif(left(trim(coalesce(p_member->>'ambient','')), 120), '');
  mood_hint := nullif(left(trim(coalesce(p_member->>'mood_hint','')), 40), '');
  IF jsonb_typeof(coalesce(p_member->'goals', 'null'::jsonb)) = 'array' THEN
    FOR item IN SELECT jsonb_array_elements_text(p_member->'goals') LOOP
      item := nullif(left(trim(item), 80), '');
      IF item IS NOT NULL AND jsonb_array_length(goals) < 3 THEN
        goals := goals || to_jsonb(item);
      END IF;
    END LOOP;
  END IF;

  IF personality IS NOT NULL THEN member := member || jsonb_build_object('personality', personality); END IF;
  IF core_drive IS NOT NULL THEN member := member || jsonb_build_object('core_drive', core_drive); END IF;
  IF jsonb_array_length(goals) > 0 THEN member := member || jsonb_build_object('goals', goals); END IF;
  IF current_intention IS NOT NULL THEN member := member || jsonb_build_object('current_intention', current_intention); END IF;
  IF ambient IS NOT NULL THEN member := member || jsonb_build_object('ambient', ambient); END IF;
  IF mood_hint IS NOT NULL THEN member := member || jsonb_build_object('mood_hint', mood_hint); END IF;

  SELECT coalesce(state, jsonb_build_object('room_id', r_id)) INTO cur
    FROM public.voice_lounge_companion_state
   WHERE user_id = auth.uid() AND character_id = p_character;
  IF cur IS NULL THEN cur := jsonb_build_object('room_id', r_id); END IF;
  IF cur->>'room_id' IS DISTINCT FROM r_id THEN
    cur := jsonb_build_object('room_id', r_id, 'scene_turns', 0, 'event_turns', '{}'::jsonb, 'used_events', '[]'::jsonb,
      'reactions', '[]'::jsonb, 'phrases', '[]'::jsonb, 'anchors', '[]'::jsonb, 'inner', '[]'::jsonb,
      'shared', '[]'::jsonb, 'self_facts', '[]'::jsonb, 'room_memory', '[]'::jsonb);
  END IF;

  autonomy := coalesce(cur->'autonomy', '{}'::jsonb);
  IF member = '{}'::jsonb THEN
    autonomy := autonomy - 'member';
  ELSE
    autonomy := jsonb_set(autonomy, '{member}', member, true);
    IF current_intention IS NOT NULL THEN
      autonomy := jsonb_set(autonomy, '{current_intention}', to_jsonb(current_intention), true);
    END IF;
    IF ambient IS NOT NULL THEN
      autonomy := jsonb_set(autonomy, '{ambient}', jsonb_strip_nulls(jsonb_build_object(
        'summary', ambient,
        'at', (extract(epoch from now()) * 1000)::bigint,
        'mood_hint', mood_hint
      )), true);
    END IF;
  END IF;

  IF autonomy = '{}'::jsonb THEN
    cur := cur - 'autonomy';
  ELSE
    cur := jsonb_set(cur, '{autonomy}', autonomy, true);
  END IF;
  cur := jsonb_set(cur, '{room_id}', to_jsonb(r_id), true);

  INSERT INTO public.voice_lounge_companion_state(user_id, character_id, room_id, state, updated_at)
  VALUES (auth.uid(), p_character, r_id, cur, now())
  ON CONFLICT (user_id, character_id) DO UPDATE
    SET state = excluded.state, room_id = excluded.room_id, updated_at = excluded.updated_at;

  RETURN jsonb_build_object(
    'room_id', r_id,
    'autonomy', coalesce(cur->'autonomy', '{}'::jsonb),
    'member', coalesce(cur->'autonomy'->'member', '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_lounge_autonomy(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_my_lounge_autonomy(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_lounge_autonomy(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_lounge_autonomy(text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
