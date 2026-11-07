-- (2026-11-07) 이한결's page keeps only 홍실당 상담. The other story, "예약 없이 온 손님" (shaman-first-visit), is switched off: the
-- page and the lobby list only the stories that are active, and rooms already started keep their own copy. The row stays, so the
-- story can be switched on again (set active=true); do not load docs/stories/shaman-first-visit.json again unless it should
-- return. He is called a 무속인 now, not a 무당: the same word in what the consultation's story card says.
-- Apply after 20261207000000_lounge_shaman_consult.sql.
BEGIN;

UPDATE public.lounge_scenarios SET active = false, updated_at = now() WHERE id = 'shaman-first-visit';

UPDATE public.lounge_scenarios SET
  relationship = replace(replace(relationship, '박수무당', '무속인'), '무당', '무속인'),
  user_role = replace(replace(user_role, '박수무당', '무속인'), '무당', '무속인'),
  prologue = replace(replace(prologue, '박수무당', '무속인'), '무당', '무속인'),
  hook = replace(replace(hook, '박수무당', '무속인'), '무당', '무속인'),
  place = replace(replace(place, '박수무당', '무속인'), '무당', '무속인'),
  updated_at = now()
WHERE id = 'shaman-hongsil';

COMMIT;
