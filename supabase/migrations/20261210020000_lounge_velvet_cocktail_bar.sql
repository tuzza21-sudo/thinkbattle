-- Apply after 20261210010000_lounge_closer_hand_and_place.sql.
-- (2026-11-07) 선우령's story "검은 장미" starts in the hotel's basement cocktail bar. The prologue ended in the corridor behind
-- the gala hall and the background was "hotel", which is the edit room of the film director; now she takes the member down to
-- the bar (the same night, the same envelope and card) and the background is the cocktail bar. Rooms already started keep
-- their own copy of the scenario; a new chat gets this one.
-- If the prologue in the database was edited by hand since docs/stories/velvet-black-rose.json was loaded, the last
-- paragraphs no longer match and this stops with a message: load the file instead (node scripts/upsert-lounge-story.mjs
-- docs/stories/velvet-black-rose.json --apply).
BEGIN;

UPDATE public.lounge_scenarios SET updated_at=now(), theme='cocktailbar',
  place=$place$자선 경매 갈라가 끝난 밤, 호텔 지하 칵테일바의 가장 끝자리. 호박빛 조명 아래 위스키 사워 두 잔, 탁자 위에는 봉투와 그녀가 건넨 명함이 있다$place$,
  prologue=replace(prologue,
$old$복도 끝에서 웃음소리가 다가왔다. 그녀는 이미 연회장 쪽으로 몸을 돌리고 있었다. 몇 걸음 가다가 고개만 돌렸다.

"그리고 오늘은 택시 타고 가요. 당신 차, B2에 세웠죠."
"그걸 어떻게…"
"주차 도장 받는 걸 봤어요. 그리고 방금 B2 CCTV 관리 기록이 11시부터 '점검 중'으로 바뀌었고요."

그녀는 이유를 더 설명하지 않았다. 대신 처음으로, 아주 낮은 목소리로 당신에게 선택을 넘겼다.

"선택은 당신이 해요. 그 봉투를 버리고 오늘 일을 잊을지, 내일 아침 10시에 나를 만날지."

잠시 멈췄다가 그녀가 덧붙였다.

"참고로, 그 봉투를 넣은 사람은 당신이 어느 쪽을 고를지 이미 궁금해하고 있을 거예요. 나처럼."$old$,
$new$그녀가 엘리베이터 쪽으로 턱짓을 했다.

"여기선 얘기 못 해요. 아래로 내려가죠. 내가 잡아 둔 자리가 있어요."

엘리베이터가 B2를 지나칠 때 그녀가 말했다.

"그리고 오늘은 택시 타고 가요. 당신 차, B2에 세웠죠."
"그걸 어떻게…"
"주차 도장 받는 걸 봤어요. 그리고 방금 B2 CCTV 관리 기록이 11시부터 '점검 중'으로 바뀌었고요."

B1에서 문이 열렸다. 간판 없는 문 안쪽은 호박빛 조명이 낮게 깔린 칵테일바였다. 바텐더가 가장 끝자리에 위스키 사워 두 잔을 내려놓았다.

그녀는 이유를 더 설명하지 않았다. 대신 처음으로, 아주 낮은 목소리로 당신에게 선택을 넘겼다.

"선택은 당신이 해요. 그 봉투를 버리고 오늘 일을 잊을지, 내일 아침 10시에 나를 만날지."

잠시 멈췄다가 그녀가 덧붙였다.

"참고로, 그 봉투를 넣은 사람은 당신이 어느 쪽을 고를지 이미 궁금해하고 있을 거예요. 나처럼."$new$)
WHERE id='velvet-black-rose';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lounge_scenarios WHERE id='velvet-black-rose' AND theme='cocktailbar' AND prologue LIKE '%B1에서 문이 열렸다. 간판 없는 문 안쪽은 호박빛 조명이 낮게 깔린 칵테일바였다.%') THEN
    RAISE EXCEPTION '선우령 story was not updated: the prologue differs from the file (load docs/stories/velvet-black-rose.json instead)';
  END IF;
END $$;

COMMIT;
