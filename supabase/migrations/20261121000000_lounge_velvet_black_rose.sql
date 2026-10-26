-- Apply after 20261120000000_lounge_character_registry.sql (it needs nothing else: the prologue is under 3,000 characters).
-- 선우령 (id velvet) is no longer a hotel and gallery art director. She is a private art director and international art
-- trade consultant who handles the private collections of chaebol families, private auctions and unlisted sales
-- (2026-10-26). The id stays, so no table changes and the members' relationships and memories with her are kept. Her four
-- stories were built on the old past (a stopped watch, an exhibition's last day), so they are removed here and one new
-- story, the black rose, is added. Her knowledge was rewritten in the same change (docs/lounge-knowledge/velvet-black-rose.jsonl,
-- loaded with scripts/import-lounge-knowledge.mjs).
-- The prologue tells the member as "당신", so the member's nickname stands in the narration like in every story.
BEGIN;

DELETE FROM public.lounge_scenarios WHERE character_id='velvet' AND id<>'velvet-black-rose';

INSERT INTO public.lounge_scenarios(id,character_id,title,hook,prologue,user_role,relationship,place,theme,sort) VALUES
  ('velvet-black-rose','velvet','검은 장미',
   '5년 전 죽은 남자의 이름이 사라진 그림 ‘검은 장미’의 소유권 문서에 다시 나타났다. 그녀는 사건을 조사할 사람으로 당신을 골랐다.',
   $prologue$돈으로 살 수 없는 것을 돈으로 거래하는 사람들이 있다.

선우령은 그들 사이에서 일한다. 재벌가의 개인 컬렉션을 관리하고, 누구에게 어떤 작품을 보여 줄지 정하고, 때로는 서로 만나서는 안 될 사람들을 한자리에 앉힌다. 아름답고 우아하지만, 쉽게 다가갈 수 없는 여자. 목소리를 높이는 법이 없는데도 그녀 앞에서는 다들 말을 고른다.

오늘 밤, 프라이빗 경매가 끝난 호텔의 비공개 갤러리 별실에는 당신과 그녀뿐이다.

당신은 오래전부터 금융 거래를 쫓아 온 사람이다. 숫자는 거짓말을 하지 않는다. 거짓말을 하는 쪽은 언제나 숫자를 만든 사람이다.

그녀가 당신 앞에 서류 두 장을 내려놓는다.

하나는 5년 전, 사라진 미술품 ‘검은 장미’의 소유권이 하룻밤 사이 어느 법인으로 넘어갔다는 이전 서류. 거래가는 12억 원인데 대금이 오간 기록은 어디에도 없다. 다른 하나는 3주 전에 새로 나타난 소유권 문서. 소유자 서명란에는, 5년 전 사망 처리된 남자의 이름이 적혀 있다.

강태준.

“이 이름을 아는 사람은 많지 않아요.”

그녀는 목소리를 높이지 않았다. 그래서 더 서늘했다.

“두 서류 사이에서 돈이 어떻게 움직였는지 알아야 해요. 자료는 내가 줄게요. 당신은 읽고, 생각한 걸 말해 줘요.”

필요한 이유는 그것뿐이라고 그녀는 말한다. 당신은 그 말이 전부가 아니라는 걸 안다. 그녀가 당신을 시험하는 것인지, 이용하려는 것인지, 아니면 처음으로 누군가에게 진실을 맡기려는 것인지는 아직 알 수 없다.

선우령이 잔을 내려놓고 당신을 똑바로 바라본다.

“한 가지만 먼저 물을게요. 당신은 왜 진실을 알고 싶어 하죠?”$prologue$,
   '금융 거래를 읽는 분석가. 그녀가 사건 조사에 선택한 사람',
   '시험하는 것인지, 이용하려는 것인지, 처음으로 진실을 맡기려는 것인지 알 수 없는 사이. 신뢰가 쌓일수록 새로운 정보와 사적인 일화가 열린다.',
   '프라이빗 경매가 끝난 밤, 호텔 비공개 갤러리의 별실. 빈 이젤과 낮은 조명, 테이블 위의 서류 한 장','hotel',0)
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, hook=EXCLUDED.hook, prologue=EXCLUDED.prologue, user_role=EXCLUDED.user_role,
  relationship=EXCLUDED.relationship, place=EXCLUDED.place, theme=EXCLUDED.theme, sort=EXCLUDED.sort, active=true, updated_at=now();

COMMIT;
