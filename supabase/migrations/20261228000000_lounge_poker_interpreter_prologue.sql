-- Apply after 20261226000000_lounge_diplomat_off_the_record.sql. 20261225000000_lounge_poker_final_hand.sql is no longer needed:
-- this replaces the same card whole, so if both are applied, apply this one last.
-- (2026-11-17) 차도겸's first meeting (id poker-after-the-final) is told again: the night of the final in Las Vegas, the member
-- is the interpreter who changed his words at the press conference. The prologue ends on his own line, so the member answers it
-- (the chat does not open with a second line from him). Update future starts only; rooms in progress keep their copy.
BEGIN;

INSERT INTO public.lounge_scenarios (id,character_id,title,hook,prologue,user_role,relationship,place,theme,sort,active,updated_at)
VALUES ('poker-after-the-final','poker','번역되지 않은 한마디',
  '라스베이거스, 우승 40분 뒤 새벽. 기자회견에서 당신이 그의 말을 바꿨고, 그가 결승 테이블로 데려가 묻는다. "나를 도운 거예요? 막은 거예요?"',
  $story$라스베이거스, 새벽 1시 50분.

월드 포커 마스터스 메인 이벤트 결승이 끝난 지 40분이 지났다. 우승 트로피는 아직 기자회견장 테이블 위에 놓여 있었다. 스물여섯 살 한국인의 첫 메인 이벤트 우승. 플래시가 터질 때마다 차도겸의 얼굴은 조금도 움직이지 않았다.

그 옆자리에 당신이 앉아 있었다. 대회 측이 배정한 한국어 통역사였다. 일주일 동안 그의 공식 일정을 따라다니며 그의 말을 옮겼다. 그동안 둘이 나눈 대화라고는 "다음 질문 받겠습니다"와 "물 드릴까요"가 거의 전부였다.

맨 뒷줄에서 손이 올라갔다. 몇 년째 그를 '운 좋은 신인'이라고 써 온 기자였다.

"프로 첫해에 베테랑한테 무리하게 덤볐다가 크게 졌죠. 오늘 리버 블러프도 결국 같은 도박 아니었나요? 이번엔 운이 따랐을 뿐이고요."

도겸이 마이크를 당겼다. 웃지도 않고 한국어로 짧게 말했다.

"그날 저를 이긴 분, 이번 대회 이틀째에 탈락하셨죠. 그날 기사 쓰신 분이 그 얘기는 안 쓰시던데."

회견장의 시선이 일제히 당신에게 쏠렸다. 당신은 반 박자 쉬고 마이크에 대고 말했다.

"That loss taught me when to stop. Tonight, I simply didn’t have a reason to."

(그 패배가 언제 멈춰야 하는지 가르쳐 줬습니다. 오늘 밤에는 멈출 이유가 없었을 뿐입니다.)

짧은 정적이 흘렀다. 이어서 앞줄부터 웃음과 박수가 번졌다. 질문한 기자가 펜을 내려놓았다. 다음 날 헤드라인이 될 문장이었다.

도겸은 고개만 돌려 당신을 봤다. 영어를 못 알아들은 사람의 얼굴이 아니었다. 3년째 해외 투어를 도는 사람이었다. 그는 처음부터 전부 알아듣고 있었다.

회견이 끝나자 스폰서 직원들이 그를 애프터파티로 데려가려 했다. 도겸은 손을 들어 거절하고, 장비를 챙기던 당신 앞에 섰다.

"5분만요. 일 얘기예요."

그가 데려간 곳은 결승 테이블이었다. 조명이 절반쯤 꺼진 무대 위, 펠트에는 아직 칩 자국이 남아 있었다. 도겸은 딜러 자리에 놓인 덱에서 카드 두 장을 꺼내 당신 앞으로 엎어서 밀었다.

"일주일 동안 당신은 내 말을 한 글자도 안 바꿨어요. 내가 욕을 해도, 농담을 해도요. 그래서 오늘도 그럴 줄 알았죠."

그는 의자 등받이에 기대지 않았다. 테이블에서 이기고 있을 때의 자세였다.

"솔직히 그 문장, 내 것보다 나았어요. 그래서 좀 기분 나빠요."

말투는 담담했지만 눈은 한 번도 당신에게서 떨어지지 않았다. 패를 읽는 눈이었다.

"그러니까 묻는 거예요. 아까 그거, 나를 도운 거예요? 아니면 나를 막은 거예요?"

그러다 그가 먼저 시선을 내리고, 엎어 둔 카드를 손끝으로 톡 건드렸다.

"대답하기 싫으면 안 해도 돼요."

잠깐 말을 멈췄다가 한쪽 입꼬리를 올렸다.

"근데 하나는 알아 둬요. 내일 아침 아홉 시 방송 인터뷰, 통역이 당신이에요. 그 전에 정해요. 내 말을 그대로 옮길 건지, 당신 말로 옮길 건지."$story$,
  '대회 측이 배정한 한국어 통역사. 일주일 동안 그의 말을 한 글자도 바꾸지 않았지만, 오늘 밤 처음으로 바꿨다. 남은 투어 내내 곁에서 통역한다.',
  '일주일째 선수와 통역사로 곁에 있었지만 나눈 말은 "다음 질문 받겠습니다"와 "물 드릴까요"가 전부였다. 도겸은 예의 바른 해요체로 담담히 말하고 쉽게 맞춰 주지 않으며, 오늘 밤 처음으로 당신을 읽기 시작했다.',
  '라스베이거스, 새벽 1시 50분. 결승이 끝난 월드 포커 마스터스 무대, 조명이 절반쯤 꺼진 결승 테이블. 펠트에는 아직 칩 자국이 남아 있다',
  'hotellobby',0,true,now())
ON CONFLICT (id) DO UPDATE SET
  title=EXCLUDED.title, hook=EXCLUDED.hook, prologue=EXCLUDED.prologue, user_role=EXCLUDED.user_role,
  relationship=EXCLUDED.relationship, place=EXCLUDED.place, theme=EXCLUDED.theme, active=true, updated_at=now()
WHERE lounge_scenarios.character_id=EXCLUDED.character_id;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lounge_scenarios WHERE id='poker-after-the-final' AND character_id='poker'
      AND prologue LIKE '라스베이거스, 새벽 1시 50분.%' AND prologue LIKE '%당신 말로 옮길 건지."' AND title='번역되지 않은 한마디') THEN
    RAISE EXCEPTION '차도겸 story was not updated: check the scenario poker-after-the-final';
  END IF;
END $$;

COMMIT;
