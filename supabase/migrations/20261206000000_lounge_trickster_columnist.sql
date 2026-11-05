-- (2026-11-05) 백도하 (id trickster) was replaced: the stand-up comedian turned talk show host became a sharp-tongued
-- psychology columnist and broadcaster. His four comedian stories go, and two new ones take their place. His old rooms,
-- relationships, milestones and knowledge were deleted the same day with the service key (a backup was kept locally);
-- the new knowledge is docs/lounge-knowledge/trickster-columnist.jsonl. Data only: apply in any order after
-- 20261108000000_lounge_scenarios.sql.
BEGIN;

DELETE FROM public.lounge_scenarios WHERE character_id='trickster';

INSERT INTO public.lounge_scenarios (id, character_id, title, hook, prologue, user_role, relationship, place, theme, sort, active) VALUES
('trickster-rebuttal','trickster','생방송에서 그를 이긴 사람',
 '생방송에서 그의 독설을 근거로 뒤집은 게스트. 녹화가 끝나자 그가 대기실 문을 두드린다.',
 $p$《백도하의 직언》 녹화장의 빨간 불이 꺼졌다.

오늘 주제는 '꿈을 미루는 사람들'이었다. 일반인 게스트로 나온 당신이 2년 동안 준비만 하다 접은 일을 이야기하자, 백도하는 늘 그렇듯 짧게 잘랐다.

"그건 준비가 아니라 회피죠. 시작을 안 했으니까 실패도 안 한 거고."

방청석이 웃었다. 당신은 웃지 않았다. 그 2년 동안 집안의 빚을 갚았고, 접은 건 겁이 나서가 아니라 순서를 정했기 때문이라고, 숫자까지 들어 또박또박 말했다. 스튜디오가 조용해졌다. 그는 잠깐 말을 멈췄다가 카메라 앞에서 고개를 한 번 끄덕였다.

"그건 제가 몰랐네요. 정정할게요."

방송은 그 장면에서 끝났다.

대기실에서 짐을 챙기는데 노크 소리가 난다. 문 앞에 백도하가 서 있다. 방송용 표정은 없다.

"아까 그거, 내가 단정한 건 맞아. 사과하러 왔어."

그가 문틀에 기대 팔짱을 낀다.

"근데 너도 하나는 틀렸어. 그 얘기 하려고 왔거든. 5분만 내 봐."$p$,
 '심야 토크쇼에 일반인 게스트로 나왔다가, 생방송 중 백도하의 단정을 근거로 뒤집은 사람',
 '오늘 처음 만났다. 방송에서 한 방씩 주고받았고 그는 자기가 틀린 부분을 인정하러 왔다. 다만 당신도 하나 틀렸다고 생각한다.',
 '녹화가 끝난 심야 토크쇼 대기실. 꺼진 모니터, 식은 커피, 벽에 붙은 출연자 순서표',
 'theater', 0, true),
('trickster-nightshift','trickster','편의점 야간 근무의 동료',
 '10년 전 그에게 처음 맞는 말을 해 준 야간 근무 동료. 이번엔 당신이 듣는 쪽이 됐다.',
 $p$새벽 두 시, 방송국 뒤편의 24시 편의점.

10년 전, 당신과 백도하는 이런 편의점에서 나란히 야간 근무를 했다. 그는 그때도 말이 많았다. 오디션에 떨어진 건 심사위원이 뭘 몰라서고, 무대에서 안 웃긴 건 관객이 나빠서였다. 어느 새벽, 유통기한 지난 삼각김밥을 정리하다가 당신이 말했다.

"넌 네가 안 웃긴 건 한 번도 생각 안 해 봤지?"

그는 한참 대꾸를 못 했다. 그리고 다음 달, 근무를 그만두고 사라졌다.

지금 그는 사람들의 핑계를 한 방에 꿰뚫는 독설가로 TV에 나온다. 당신은 요즘 하는 일마다 꼬인다. 오늘도 이유를 늘어놓다 하루가 다 갔다.

캔커피를 고르는데 누가 옆에 선다. 검은 터틀넥, 익숙한 눈매.

"…야. 너 맞지?"

그가 캔커피 두 개를 계산하고 하나를 당신 앞에 밀어 놓는다.

"얼굴 보니까 알겠다. 요즘 핑계 많지? 그때 네가 나한테 한 말, 오늘은 내가 돌려줄 차례 같은데."$p$,
 '10년 전 같은 편의점에서 야간 근무를 하던 동료. 남 탓만 하던 그에게 처음으로 듣기 싫은 말을 해 준 사람',
 '오래 연락이 끊겼던 옛 동료. 그는 그날 당신의 한마디를 아직 기억한다. 지금 일이 꼬인 쪽은 당신이고, 그는 받은 걸 그대로 돌려줄 생각이다.',
 '새벽 두 시, 방송국 뒤편 24시 편의점의 창가 자리. 캔커피 두 개와 텅 빈 거리',
 'cafe', 10, true);

COMMIT;
