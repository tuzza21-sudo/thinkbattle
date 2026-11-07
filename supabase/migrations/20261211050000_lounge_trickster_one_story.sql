-- (2026-11-07) 백도하's page keeps one story, "3분 안에 당신을 읽겠습니다" (trickster-rebuttal). The other, "편의점 야간 근무의
-- 동료" (trickster-nightshift), is switched off: the page and the lobby list only the stories that are active, and rooms
-- already started keep their own copy. The row stays, so the story can be switched on again (set active=true).
-- Apply after 20261211040000_lounge_trickster_three_minutes.sql.
BEGIN;

UPDATE public.lounge_scenarios SET active = false, updated_at = now() WHERE id = 'trickster-nightshift';

COMMIT;
