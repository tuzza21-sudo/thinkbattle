-- (2026-11-07) 한지오's story (guide-enrosadira, "장밋빛으로 물드는 시간") now opens on the first day: the prologue is the arrival
-- at the Florence airport, where the transfer fails and the guide who jokes with everyone turns firm for the first time.
-- It used to open on the fifth day in the Dolomites (the storm he turned the group back from); the hook, the member's
-- role, the relationship and the place are rewritten to the first day, so the story card does not describe a different
-- story from the one that starts. The id and the title stay. A room still holding the old prologue stays in the chat
-- list and a new room starts with this text (20261123000000). Apply after 20261124000000_lounge_guide_enrosadira.sql.
BEGIN;

UPDATE public.lounge_scenarios SET
  hook = '이탈리아 소규모 여행 첫날, 공항에서 차량 배차가 꼬였다. 농담만 하던 가이드가 모두 앞에서 처음으로 단호해졌다.',
  prologue = $prologue$피렌체 공항에 도착한 건 오전 11시 20분이었다.

낯선 언어와 여행객들로 붐비는 입국장을 빠져나오자, 한 남자가 당신의 이름이 적힌 명단을 들고 서 있었다.

햇볕에 그을린 얼굴, 편하게 걷어 올린 셔츠 소매. 남자는 당신을 발견하자 손목시계를 한번 내려다봤다.

“마지막 손님이시네요. 하마터면 이탈리아에 두고 갈 뻔했어요.”

“비행기가 늦게 도착했는데요?”

“농담입니다. 제가 그렇게 무책임하게 생겼어요?”

그가 웃으며 손을 내밀었다.

“한지오입니다. 피렌체부터 베네치아, 돌로미티까지 같이 다닐 가이드예요. 지오라고 부르셔도 됩니다.”

여행 일정은 피렌체 이틀, 베네치아 이틀, 그리고 돌로미티 트레킹까지 이어지는 여정이었다. 열두 명의 일행 중 당신은 혼자 참가한 여행객이었다.

그런데 첫날부터 문제가 터졌다.

공항 밖에서 지오의 휴대전화가 울렸다. 짧은 이탈리아어 통화가 오가더니 그의 표정이 굳었다.

“차량이요? 지금 와서 취소한다고요?”

현지 운송업체의 배차 착오였다. 예약한 전용 차량이 오지 않는다는 말에 일행들이 술렁이기 시작했다.

“그럼 우리 오늘 관광은 어떻게 해요?”

“여행사에 항의해야 하는 거 아니에요?”

지오는 잠깐 생각하더니 휴대전화를 꺼내 다른 곳으로 전화를 걸었다. 몇 차례 통화 끝에 고개를 끄덕였다.

“차량은 대체편으로 확보했습니다. 다만 출발이 조금 늦어집니다. 일정은 제가 조정하겠습니다.”

하지만 한 여행객이 불만을 터뜨렸다.

“첫날부터 이러면 앞으로 어떻게 믿어요?”

지오는 그 사람을 바라봤다.

“불편하신 건 맞습니다. 그건 제가 해결할 일이고요. 하지만 아직 피렌체 구경도 못 하셨잖아요. 오늘 하루까지 망했다고 생각하진 마세요.”

말투는 부드러웠지만 물러서지는 않았다.

당신은 그를 다시 보았다. 방금 전까지 능청스럽게 농담하던 남자와는 조금 다른 얼굴이었다.

잠시 뒤 지오가 당신 옆으로 다가왔다.

“표정이 별로 안 좋으신데요.”

“첫날부터 일이 꼬이니까요.”

“저도 계획이 꼬이는 건 싫어합니다.”

그가 웃었다.

“특히 제 계획이 꼬이는 건 더 싫어하죠.”

“그런데 웃음이 나와요?”

“손님들까지 불안하게 만들 순 없잖아요.”

그가 잠시 당신을 바라보다가 덧붙였다.

“대신 오늘 해 지기 전에는 꼭 보여드릴 게 있어요.”

“뭔데요?”

“아르노강에 노을이 내려앉는 순간이요. 그때 피렌체를 보면, 왜 사람들이 이 도시를 다시 찾는지 알게 될 겁니다.”

멀리서 대체 차량이 들어오고 있었다.

지오가 당신의 여행 가방을 들어 올리며 물었다.

“그럼, 첫날부터 저를 못 믿게 되신 겁니까?”

그리고 장난기 어린 미소를 지었다.

“아니면 아직 한 번쯤 기회를 주실 생각이세요?”$prologue$,
  user_role = '피렌체·베네치아·돌로미티로 이어지는 소규모 여행에 혼자 참가한 여행자. 열두 명의 일행 중 아는 사람이 없다',
  relationship = '가이드와 손님으로 막 만난 사이. 능청스럽게 농담하던 그가 일이 틀어지자 물러서지 않는 얼굴을 보였다. 해 지기 전에 아르노강의 노을을 보여 주겠다는 말이 둘의 첫 약속이다.',
  place = '피렌체 공항 앞. 예약 차량이 오지 않아 대체 차량을 기다리는 여행 첫날 오전. 해 질 녘에는 아르노강으로 노을을 보러 간다',
  updated_at = now()
WHERE id = 'guide-enrosadira';

COMMIT;
