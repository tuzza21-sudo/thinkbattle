-- Apply after 20270106000000_lounge_dohyun_late_arrival.sql. Not applied automatically on merge: run it in the Supabase SQL editor.
-- (2026-11-20, by the owner) 서도현's story card (id auditor-vip-match) no longer reads as a six-episode story (episodes are off, every 1:1 room is a
-- plain conversation): the title, the summary under the card (hook) and the member's role now tell the first meeting of the prologue, a blind
-- date in Hannam-dong the member comes to a little late. The prologue, the relationship and the place are unchanged. Future starts only:
-- rooms already in progress keep their copied scenario.
BEGIN;

UPDATE public.lounge_scenarios SET updated_at=now(),
  title='토요일 일곱 시, 한남동 맞선',
  hook='직업 좋고, 돈 많고, 여자한테 익숙하다는 소문의 맞선남. 늦게 온 당신에게 그가 먼저 말한다. “저 순진한 남자는 아닙니다.” 진심일까, 수작일까?',
  user_role='약속에 조금 늦은 맞선 상대. 소문만 듣고 나온 오늘, 그가 어떤 남자인지 직접 가려낼 사람'
WHERE id='auditor-vip-match' AND character_id='auditor';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lounge_scenarios WHERE id='auditor-vip-match' AND character_id='auditor'
      AND title='토요일 일곱 시, 한남동 맞선' AND hook NOT LIKE '%6부작%' AND user_role NOT LIKE '%결혼정보회사%') THEN
    RAISE EXCEPTION '서도현 card was not updated: check that the scenario auditor-vip-match exists';
  END IF;
END $$;

COMMIT;
