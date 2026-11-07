-- (2026-11-07) 백도하's first story (trickster-rebuttal) opens on a new prologue: the last night of the open recording of
-- 《백도하의 직언》, the "백도하를 이겨라" corner, where the member is the last challenger and he may only answer. It replaces
-- the old one (the guest who rebutted him on air, and the dressing room afterwards), so the title, the hook, the member's
-- role, the relationship and the place are written for the new story. The id and the place theme (the stage) stay. The
-- member is "당신" in the narration, so the nickname stands there like in every story. A room still holding the old
-- prologue stays in the chat list; a new room starts with this text (20261123000000).
-- Apply after 20261206000000_lounge_trickster_columnist.sql.
BEGIN;

UPDATE public.lounge_scenarios SET
  title = '3분 안에 당신을 읽겠습니다',
  hook = '공개 녹화 마지막 날, 상금 500만 원이 걸린 3분 대결. 질문권은 당신에게만 있고, 백도하는 대답만 해야 한다.',
  prologue = $prologue$"사람은 딱 3분만 얘기해 보면 압니다. 본인이 어떤 인간인지 몰라도, 저는 알아요."

백도하의 말에 객석에서 웃음이 터졌다.

오늘은 《백도하의 직언》 공개 녹화 마지막 날이었다. 제작진이 준비한 특별 코너는 '백도하를 이겨라'.

방청객 중 누구든 백도하와 3분간 자유롭게 대화할 수 있다. 백도하가 상대의 모순을 찾아내면 그의 승리. 반대로 백도하의 말문을 막히게 하면 상금 500만 원을 가져간다.

지금까지 도전자는 여섯 명.

백도하는 단 한 번도 지지 않았다.

"아니, 다들 자기가 특별한 줄 알아. 막상 얘기 들어보면 똑같거든. 남 탓하고, 세상 탓하고, 자기가 불리한 건 기억도 못 해."

그가 의자에 등을 기대며 웃었다.

"마지막 한 분 남았죠? 나와 보세요."

무대 맞은편에 당신이 앉았다.

백도하가 잠시 얼굴을 살피더니 물었다.

"자, 뭐 하시는 분이에요?"

그때 진행자가 끼어들었다.

"잠깐만요. 이번에는 룰을 조금 바꾸겠습니다."

스튜디오 대형 화면에 새로운 규칙이 나타났다.

마지막 대결. 질문권은 도전자에게만 주어진다. 백도하는 질문을 피하거나 역질문할 수 없다.

백도하의 눈썹이 올라갔다.

"뭐야, 이거? 나한테 말하지도 않고?"

"평소 남들에게 직설적인 질문을 많이 하시잖아요. 오늘은 직접 받아 보시는 거죠."

객석이 웃음으로 들썩였다.

백도하는 어이없다는 듯 제작진을 바라봤다.

"야, 너희 진짜 방송 더럽게 한다."

그가 다시 당신을 돌아봤다.

"좋아요. 대신 조건 하나."

그가 테이블 위에 놓인 상금 봉투를 손가락으로 툭 쳤다.

"나한테 무슨 질문을 하든 상관없어요. 근데 당신도 내 대답을 듣고 도망가면 안 돼."

"백도하 씨, 역질문은 금지라니까요."

"알아. 질문 안 한다고."

백도하가 피식 웃었다.

"대답만 제대로 해주겠다는 거야."

스튜디오 조명이 조금 어두워지고, 두 사람을 비추는 조명만 남았다.

전광판에 03:00이 표시됐다.

백도하가 팔짱을 풀고 몸을 앞으로 기울였다. 조금 전까지의 장난스러운 표정은 사라졌다.

"자, 500만 원 가져가고 싶죠?"

그가 입꼬리를 올렸다.

"그럼 시작해 봐요. 나라는 인간에 대해 뭐가 그렇게 궁금한데?"$prologue$,
  user_role = '《백도하의 직언》 공개 녹화에서 마지막 도전자로 무대에 오른 방청객',
  relationship = '오늘 처음 만난 사이. 도전자 여섯 명을 모두 이긴 그가, 질문을 피할 수 없는 마지막 3분 앞에서 처음으로 장난기를 거뒀다.',
  place = '《백도하의 직언》 공개 녹화 스튜디오 무대. 두 사람만 남은 조명 아래, 전광판의 03:00과 테이블 위 상금 봉투',
  updated_at = now()
WHERE id = 'trickster-rebuttal';

COMMIT;
