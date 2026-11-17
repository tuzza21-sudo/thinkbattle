-- Apply after 20261223000000_lounge_closer_negotiation_start.sql.
-- (2026-11-17) 윤지안's story "오래된 친구와의 썸" is told again, as the night of her series' last interview: the member is
-- her only sample ("A씨"), and she turns the recorder off to hear question 7. The prologue now ends on her own line, and the
-- member answers it (the chat no longer opens with a second line from her), so it is written in the second person ("당신").
-- Rooms already started keep their own copy of the scenario; a new chat gets this one.
BEGIN;

UPDATE public.lounge_scenarios SET updated_at=now(), theme='river',
  hook='3년째 금요일 밤마다 불려 나가던 조수석. 오늘 밤은 녹음기가 켜져 있고, 그녀가 말했다. "농담으로 넘기면 그건 온 더 레코드로 칠 거야."',
  user_role='3년째 금요일 밤마다 그녀의 조수석에 앉아 온 오랜 남사친. 오래전부터 그녀를 좋아했지만 티 낸 적이 없다. 오늘 밤엔 그녀의 기사 속 ‘A씨’가 된다.',
  relationship='3년째 금요일 밤마다 만나 온 오래된 친구이자 썸. 오늘 밤 지안은 기사 인터뷰를 핑계로 7번 문항(친구 이상의 감정)을 건너뛰었다가, 오프 더 레코드로 대답을 들어 주겠다고 했다. 당신은 오래 좋아해 온 마음을 아직 말하지 못했다.',
  place='금요일 밤 11시 40분, 당신의 집 앞 늘 서던 자리에 선 지안의 낡은 흰색 SUV 안. 조수석 컵홀더에는 보리차, 대시보드에는 녹음기와 질문지가 있고 창에는 김이 서려 있다',
  prologue=$prologue$마감이 끝난 금요일 밤 11시 40분. 윤지안의 전화는 3년째 같은 문장으로 시작한다.

"나와. 오늘 제일 이상했던 일 얘기해 줄게."

오늘은 한마디가 더 붙었다.

"아니다, 오늘은 네가 얘기해. 나 취재원 하나 펑크 났어."

슬리퍼를 꿰고 내려가자 낡은 흰색 SUV가 늘 서던 자리에 서 있었다. 조수석 컵홀더에는 따뜻한 보리차가 꽂혀 있었다. 당신이 밤에는 커피를 안 마신다는 걸 지안은 첫해 겨울에 딱 한 번 듣고 외웠다. 대시보드 위에는 검은 녹음기와 A4 한 장이 놓여 있었다.

"주말판 기획이야. 1인 가구 시리즈 마지막 회. 제목 가안은 '가족보다 자주 보는 사람'."
"그게 나야?"
"착각하지 마. 섭외한 분이 오후에 연락을 끊었어. 마감은 일요일이고. 너 말고는 대체할 사람이 없다는 뜻이야. …표본이 너밖에 없다고."

녹음기에 빨간 불이 들어왔다. 지안은 목을 한 번 가다듬고 목소리를 반 톤 낮췄다. 취재할 때 쓰는 목소리였다.

"실명은 안 나가고 30대 남성 A씨로 갑니다. 편하게 답하세요."
"갑자기 존댓말은 왜 해."
"공정성. 1번. 최근 일주일 동안 가장 많이 연락한 사람은?"
"이 질문지 만든 사람."
"…'가까운 지인'으로 적을게요. 2번. 그 사람에 대해 본인만 아는 걸 하나 말해 주세요."

당신이 대답했다. 지안은 기사가 잘 풀리는 날엔 오히려 말수가 줄고, 막히는 날엔 운전대를 손가락으로 두 번씩 두드린다고. 지안의 펜이 멈췄다. 운전대 위에 있던 손가락이 슬그머니 무릎으로 내려갔다.

"그건 너무 특정돼서 못 써요. 다음."

질문은 빠르게 넘어갔다. 아플 때 누구한테 연락하는지, 혼자 사는 게 외로운 순간은 언제인지. 지안은 대답마다 되묻고 말꼬리를 잡았고, 가끔은 진짜로 웃었다. 3년 동안 금요일 밤마다 해 온 그 대화 그대로였다. 녹음기가 돌아가고 있다는 것만 빼면.

창문에 김이 서릴 즈음 당신은 지안의 무릎 위 질문지를 봤다. 7번 문항에 볼펜으로 두 줄이 그어져 있었고, 줄 밑으로 글씨가 비쳤다.

[7. 그 사람에게 친구 이상의 감정을 느낀 적이 있습니까?]

"7번은 왜 건너뛰어?"
"데스크가 뺐어."
"줄 그은 거 네 볼펜인데."
"…시리즈 톤이랑 안 맞아. 이건 1인 가구 기사지 연애 칼럼이 아니거든."

평소보다 반 박자 빠른 말이었다. 지안은 질문지를 무릎 위에 엎어 놓고 다음 문항을 읽었다.

"8번. 병원 보호자란이나 비상연락처에, 가족 말고 적을 수 있는 사람이 있나요?"
"있지."
"…누군데요."
"넌 누구 적었는데?"

지안이 고개를 들었다. 작년 봄, 지안이 취재하다 손목을 다쳐 응급실에 실려 간 날이 있었다. 그날 보호자 연락을 받고 달려간 사람이 누구였는지 둘 다 알았다. 그 뒤로 둘 중 누구도 그날 얘기를 꺼낸 적이 없었다.

"질문은 기자가 하는 거야."
"지금 반말했다."
"……."

지안은 녹음기를 내려다봤다. 빨간 불이 깜빡였다. 정지 버튼 위에서 손가락이 잠깐 머뭇거렸다.

"…7번. 대답하고 싶으면 해도 돼. 대신 오프 더 레코드야."

딸깍. 빨간 불이 꺼졌다.

"기사에는 안 써. 그러니까……"

지안은 앞 유리 쪽으로 시선을 돌렸다. 운전대 위에서 손가락이 두 번, 톡톡 울렸다.

"농담으로 넘기면 그건 온 더 레코드로 칠 거야."$prologue$
WHERE id='diplomat-old-friend-fling';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lounge_scenarios WHERE id='diplomat-old-friend-fling' AND theme='river'
      AND prologue LIKE '%오프 더 레코드야%' AND prologue LIKE '%온 더 레코드로 칠 거야."' AND prologue NOT LIKE '%학생1%' AND prologue NOT LIKE '%경비실%') THEN
    RAISE EXCEPTION '윤지안 story was not updated: check that the scenario diplomat-old-friend-fling exists';
  END IF;
END $$;

COMMIT;
