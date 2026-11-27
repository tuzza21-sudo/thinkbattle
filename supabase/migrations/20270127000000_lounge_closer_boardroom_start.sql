-- (2026-11-28, by the owner) 강무진's story "6개월의 연인" starts in the boardroom (중역 회의실, the negotiating room) and stays
-- there: the place and the prologue said "his office", so the engine's first scene was "강무진의 사무실" and the background
-- moved from the boardroom to an office. The prologue's signing room, the opening place and the first episode's note on where
-- the prologue ended now say his firm's boardroom. Later episodes that happen in his own office are not changed.
-- Rooms already started keep their own copy of the scenario; a new chat gets this one.
BEGIN;

UPDATE public.lounge_scenarios SET updated_at=now(),
  prologue=replace(prologue,
    '다음 날 오전, 당신은 도심의 고층 빌딩에 있는 그의 사무실로 불려 왔다. 통유리 너머로 회색빛 도시가 펼쳐져 있었고, 회의 테이블 위에는 이미 서류 한 부가 놓여 있었다.',
    '다음 날 오전, 당신은 도심의 고층 빌딩에 있는 그의 자문사 중역 회의실로 불려 왔다. 수천억 원짜리 협상이 끝나는 방이었다. 통유리 너머로 회색빛 도시가 펼쳐져 있었고, 긴 월넛 회의 테이블 위에는 이미 서류 한 부가 놓여 있었다.'),
  place='계약서에 서명한 날 오전, 고층 빌딩에 있는 그의 자문사 중역 회의실(협상장). 긴 월넛 테이블 위에 서명한 합의서가 놓여 있다. 손을 잡은 채 비서실장의 메시지를 읽은 직후다. 당신 가족과의 첫 저녁 식사는 내일 저녁이다. 첫 대화는 이 중역 회의실에서 이어 가고 그의 개인 사무실로 옮기지 않는다',
  episodes=replace(episodes::text, '프롤로그는 전날 그의 사무실에서 끝났다', '프롤로그는 전날 그의 자문사 중역 회의실에서 끝났다')::jsonb
WHERE id='closer-contract-love';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lounge_scenarios WHERE id='closer-contract-love' AND prologue LIKE '%그의 자문사 중역 회의실로 불려 왔다%' AND place LIKE '%중역 회의실(협상장)%' AND episodes::text LIKE '%전날 그의 자문사 중역 회의실에서 끝났다%') THEN
    RAISE EXCEPTION '강무진 story was not updated: check that the scenario closer-contract-love exists and its prologue still has the old line';
  END IF;
END $$;

COMMIT;
