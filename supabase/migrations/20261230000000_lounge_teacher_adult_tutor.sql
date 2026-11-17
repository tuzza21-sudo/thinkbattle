-- Apply in the Supabase SQL editor (migrations are not applied on merge).
-- (2026-11-17) 정하린 (id teacher) is an adult English tutor, not a CSAT lecturer. Her story card "강의가 끝난 뒤의 라운지"
-- (teacher-after-the-lecture) names her that way; only the words change. It leaves the rest of the card as it is, so it
-- works whichever version of the card is in the database, and does nothing when there is none. Rooms already started keep
-- their own copy.
BEGIN;

UPDATE public.lounge_scenarios SET updated_at=now(),
  hook=replace(replace(hook,'수능 영어 1타 강사','성인 영어 강사'),'수능 영어 강사','성인 영어 강사'),
  prologue=replace(replace(prologue,'수능 영어 1타 강사','성인 영어 강사'),'수능 영어 강사','성인 영어 강사')
WHERE id='teacher-after-the-lecture' AND character_id='teacher'
  AND (hook LIKE '%수능%' OR prologue LIKE '%수능%');

COMMIT;
