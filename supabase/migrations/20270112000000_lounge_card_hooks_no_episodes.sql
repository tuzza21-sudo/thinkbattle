-- Apply after 20270111000000_lounge_dohyun_card_copy.sql. Not applied automatically on merge: run it in the Supabase SQL editor.
-- (2026-11-20, by the owner) The summaries under 선우령's (velvet-black-rose) and 강무진's (closer-contract-love) story cards no longer say
-- "6부작 미스터리" / "1부 5화" (episodes are off; every 1:1 room is a plain conversation). Only the hook changes. Future starts only.
BEGIN;

UPDATE public.lounge_scenarios SET updated_at=now(),
  hook='자선 경매 갈라, 카탈로그에 없는 그림이 스크린에 떴다. 응찰자 이름은 5년 전 죽은 남자. 그 거래에 “특이사항 없음”이라 서명한 사람이 당신이다.'
WHERE id='velvet-black-rose' AND character_id='velvet';

UPDATE public.lounge_scenarios SET updated_at=now(),
  hook='결혼 압박을 피하려 그를 6개월짜리 연인으로 고용했다. 그는 합의서부터 내밀고, 손을 잡을 때도 돌이킬 수 없다고 선언한다. 가족과의 첫 저녁은 내일이다.'
WHERE id='closer-contract-love' AND character_id='closer';

DO $$ BEGIN
  IF (SELECT count(*) FROM public.lounge_scenarios WHERE id IN ('velvet-black-rose','closer-contract-love') AND hook NOT LIKE '%부작%' AND hook NOT LIKE '%5화%') <> 2 THEN
    RAISE EXCEPTION 'The velvet and closer cards were not both updated: check that velvet-black-rose and closer-contract-love exist';
  END IF;
END $$;

COMMIT;
