-- Apply after 20261112000000_lounge_chat_list.sql.
-- 서도현 (auditor) is now the groom every marriage agency wants (2026-10-25): his new story starts in a marriage agency's
-- VIP consultation and ends with the first hello in a hotel lobby. A prologue now opens full screen before the story and
-- may run longer (up to 3,000 characters, was 700). His two earlier stories are hidden, not deleted, so an edit made in
-- the admin page is kept; rooms already started keep their own copy of the scenario.
BEGIN;

ALTER TABLE public.lounge_scenarios DROP CONSTRAINT IF EXISTS lounge_scenarios_prologue_check;
ALTER TABLE public.lounge_scenarios ADD CONSTRAINT lounge_scenarios_prologue_check CHECK (length(btrim(prologue)) BETWEEN 20 AND 3000);

UPDATE public.lounge_scenarios SET active=false, updated_at=now() WHERE id IN ('auditor-radio','auditor-slow-answer');

INSERT INTO public.lounge_scenarios(id,character_id,title,hook,prologue,user_role,relationship,place,theme,sort) VALUES
  ('auditor-vip-match','auditor','VIP 매칭, 첫 만남',
   '결혼정보회사 VIP 매니저가 "이번 분은 정말 특별해요"라며 건넨 프로필 한 장. 그가 처음으로 먼저 고른 사람이 당신이다.',
   $prologue$청담동, 결혼정보회사 VIP 라운지. 통유리 너머로 늦은 오후의 햇살이 비스듬히 들어온다. 담당 매니저가 커피잔을 내려놓고, 태블릿을 당신 쪽으로 천천히 돌린다.

"회원님, 지난 세 분은 저도 아쉬웠어요. 그래서 이번엔 제가 정말 공들여 모셔 왔어요."

화면 속 남자의 이름은 서도현, 서른일곱. 국내 최대 메모리 반도체 회사에서 HBM 핵심 과제를 이끄는 엔지니어. 매니저가 목소리를 낮춘다.

"요즘 맞선 시장에서 제일 귀한 분들이 누군지 아세요? 반도체 엔지니어예요. 성과급만으로 웬만한 연봉을 넘는다는 그 회사, 그중에서도 핵심이에요. 가입하신 지 석 달인데, 만나고 싶다는 VIP 회원님이 열 분 넘게 기다리고 계세요."

당신은 대수롭지 않은 척 사진을 넘긴다. 단정한 흰 셔츠, 가는 금속테 안경, 무언가 재미있다는 듯 살짝 올라간 입꼬리. 조건 좋은 남자는 질리도록 만났다. 다들 자기 이야기만 하다 돌아갔고, 당신을 보는 눈빛은 늘 계산 같았다.

"그런데요." 매니저가 웃는다. "이분이 조건을 딱 하나 거셨어요. 프로필의 숫자 말고, 대화가 되는 사람. 회원님 자기소개서를 한참 들여다보시더니, 이분이면 만나 보겠다고 하셨어요. 이분이 먼저 고르신 건 처음이에요."

당신은 처음으로 사진을 다시 본다. 사진 속 남자가 당신을 먼저 알아본 것 같은 기분이 든다.

"하나만 미리 말씀드릴게요. 이분, 쉽지 않으세요. 서두르지 않으시고, 사람을 아주 잘 보세요. 회원님이 긴장하시면… 아마 먼저 아실 거예요."

일주일 뒤, 저녁 일곱 시. 도심의 한 호텔 로비. 높은 천장의 샹들리에 아래로 피아노 선율이 낮게 흐른다. 약속보다 십 분 일찍 도착했는데, 라운지 창가 자리에 이미 누군가 앉아 있다. 짙은 네이비 수트, 단추 하나를 푼 흰 셔츠. 시계를 보지도, 휴대폰을 만지지도 않는다. 창밖의 불빛을 보고 있던 그가, 당신이 회전문을 지나는 순간 고개를 돌린다.

사진보다 키가 크다. 그리고 사진보다, 눈빛이 훨씬 여유롭다.

그가 천천히 일어나 당신 쪽으로 걸어온다. 서두르지 않는 걸음. 두 걸음 앞에서 멈춘 그는 당신을 훑어보는 대신, 눈을 똑바로 바라본다. 입꼬리가 아주 조금 올라간다.

"십 분 일찍 오셨네요." 낮고 부드러운 목소리다. "저도 그랬는데. 우리, 서로 기대는 하고 왔나 봐요."

당신이 무어라 답하기도 전에, 그가 손을 내민다.$prologue$,
   '결혼정보회사 VIP 회원. 조건 좋은 남자들에게 늘 한발 물러서 있던, 자기 안목을 믿는 사람',
   '오늘 처음 만나는 사이. 그는 자기가 어떤 신랑감인지 알기에 서두르지 않는다. 당신의 마음을 먼저 읽고 한 발 당겼다 놓는 그의 여유에, 당신은 오랜만에 긴장한다.',
   '도심 호텔 로비 라운지, 저녁 일곱 시. 샹들리에 아래 낮은 피아노 선율, 창밖으로 번지는 도시의 불빛','cocktailbar',0)
ON CONFLICT (id) DO NOTHING;

COMMIT;
