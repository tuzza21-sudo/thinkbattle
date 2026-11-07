-- Apply after 20261204000000_lounge_closer_prologue_new_bible.sql.
-- (2026-11-07) 강무진's story "6개월의 연인":
--  * the prologue's line before the hand is taken: "손은 잡아도 됩니까?" becomes "정말 손 잡습니다. 이제 돌이킬 수 없습니다.",
--    and the card's hook and relationship no longer say he asks before holding a hand;
--  * the opening place followed the first episode (the next evening, in his car at the family house, "곧 가족과의 첫
--    저녁 식사"), so he spoke of "tonight's dinner" while the prologue says the dinner is tomorrow. It now follows where the
--    prologue ends: the day of the signing, in his office, just after the message from the chief of staff.
-- Rooms already started keep their own copy of the scenario; a new chat gets this one.
BEGIN;

UPDATE public.lounge_scenarios SET updated_at=now(),
  prologue=replace(prologue, '“손은 잡아도 됩니까?”', '“정말 손 잡습니다. 이제 돌이킬 수 없습니다.”'),
  hook=replace(hook, '손을 잡기 전에도 먼저 묻는다', '손을 잡을 때도 돌이킬 수 없다고 선언한다'),
  relationship=replace(relationship, '손을 잡기 전에도 먼저 묻지만, 당신 앞에서는 즉답이 늦어진다', '손을 잡을 때는 “돌이킬 수 없다”고 못 박지만, 당신 앞에서는 즉답이 늦어진다'),
  place='계약서에 서명한 날, 그의 사무실. 손을 잡은 채 비서실장의 메시지를 읽은 직후다. 당신 가족과의 첫 저녁 식사는 내일 저녁이다'
WHERE id='closer-contract-love';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lounge_scenarios WHERE id='closer-contract-love' AND prologue LIKE '%정말 손 잡습니다. 이제 돌이킬 수 없습니다.%' AND place LIKE '%첫 저녁 식사는 내일 저녁이다') THEN
    RAISE EXCEPTION '강무진 story was not updated: check that the scenario closer-contract-love exists and its prologue still has the old line';
  END IF;
END $$;

COMMIT;
