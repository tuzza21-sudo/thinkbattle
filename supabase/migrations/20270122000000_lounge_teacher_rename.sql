-- 정하린 → 차유진 (2026-11-26, by the owner): the English tutor (id teacher, and her lesson room teachertutor) is renamed
-- everywhere on the site. The code carries the new name; this changes what the database already holds:
--   - lounge_scenarios: her story cards and the lesson card (title, hook, prologue, roles, place)
--   - voice_lounge_rooms: the topic, summary memory, copied story card and class state of her rooms
--   - voice_lounge_messages: her name on her messages, and the name inside the messages of her rooms
--   - voice_lounge_companion_state, voice_lounge_memories, voice_lounge_relationships: what she remembers of each member
-- "정하린" becomes "차유진" and "하린" becomes "유진" (both end in ㄴ, so 이/은/과 stay right). Nothing else in these
-- rows changes, and running it twice changes nothing more.
BEGIN;

UPDATE public.lounge_scenarios SET updated_at = now(),
  title = replace(replace(title, '정하린', '차유진'), '하린', '유진'),
  hook = replace(replace(hook, '정하린', '차유진'), '하린', '유진'),
  prologue = replace(replace(prologue, '정하린', '차유진'), '하린', '유진'),
  user_role = replace(replace(user_role, '정하린', '차유진'), '하린', '유진'),
  relationship = replace(replace(relationship, '정하린', '차유진'), '하린', '유진'),
  place = replace(replace(place, '정하린', '차유진'), '하린', '유진')
WHERE character_id IN ('teacher', 'teachertutor')
  AND concat_ws(' ', title, hook, prologue, user_role, relationship, place) LIKE '%하린%';

UPDATE public.voice_lounge_rooms SET
  topic = replace(replace(topic, '정하린', '차유진'), '하린', '유진'),
  memory = replace(replace(memory, '정하린', '차유진'), '하린', '유진'),
  scenario = CASE WHEN scenario IS NULL THEN NULL ELSE replace(replace(scenario::text, '정하린', '차유진'), '하린', '유진')::jsonb END,
  story_state = CASE WHEN story_state IS NULL THEN NULL ELSE replace(replace(story_state::text, '정하린', '차유진'), '하린', '유진')::jsonb END
WHERE host_persona IN ('teacher', 'teachertutor')
  AND concat_ws(' ', topic, memory, scenario::text, story_state::text) LIKE '%하린%';

UPDATE public.voice_lounge_messages AS m SET
  nickname = replace(replace(m.nickname, '정하린', '차유진'), '하린', '유진'),
  text = replace(replace(m.text, '정하린', '차유진'), '하린', '유진')
FROM public.voice_lounge_rooms AS r
WHERE m.room_id = r.id AND r.host_persona IN ('teacher', 'teachertutor')
  AND (m.nickname LIKE '%하린%' OR m.text LIKE '%하린%');

UPDATE public.voice_lounge_companion_state SET updated_at = now(),
  state = replace(replace(state::text, '정하린', '차유진'), '하린', '유진')::jsonb
WHERE character_id IN ('teacher', 'teachertutor') AND state::text LIKE '%하린%';

UPDATE public.voice_lounge_memories SET
  summary = replace(replace(summary, '정하린', '차유진'), '하린', '유진'),
  follow_up = replace(replace(follow_up, '정하린', '차유진'), '하린', '유진')
WHERE character_id IN ('teacher', 'teachertutor') AND concat_ws(' ', summary, follow_up) LIKE '%하린%';

UPDATE public.voice_lounge_relationships SET
  recent_events = replace(replace(recent_events::text, '정하린', '차유진'), '하린', '유진')::jsonb,
  memories = replace(replace(memories::text, '정하린', '차유진'), '하린', '유진')::jsonb
WHERE character_id IN ('teacher', 'teachertutor') AND concat_ws(' ', recent_events::text, memories::text) LIKE '%하린%';

COMMIT;
