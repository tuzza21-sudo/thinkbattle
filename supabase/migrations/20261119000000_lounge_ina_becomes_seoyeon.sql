-- Apply after 20261118000000_lounge_trickster_live_writer.sql (it needs nothing else: the prologue is under 3,000 characters).
-- 한이나 (id ina), the interviewer, is replaced by 윤서연, a book editor and the woman of a divorced man's first blind date
-- (2026-10-26). The id stays, so no table changes: rooms, relationships, memories, knowledge and stories of 한이나 were
-- deleted (data only, done with the service key), her two stories are removed here and her new story is added.
-- The prologue tells the member as "당신", so the member's nickname stands in the narration like in every story.
BEGIN;

DELETE FROM public.lounge_scenarios WHERE character_id='ina' AND id<>'ina-first-blind-date';

INSERT INTO public.lounge_scenarios(id,character_id,title,hook,prologue,user_role,relationship,place,theme,sort) VALUES
  ('ina-first-blind-date','ina','이혼 후 3년, 첫 소개팅',
   '3년 만의 첫 소개팅. 환하게 웃으며 나타난 그녀가 조건을 하나 건다. "오늘은 과거도 미래도 걱정 금지, 저랑 재미있게 놀기."',
   $prologue$이혼한 지 3년.

다시는 누군가를 좋아하지 않을 줄 알았다.

사랑을 몰라서가 아니었다. 사랑이 어떻게 끝나는지, 끝난 뒤에 무엇이 남는지 너무 잘 알게 되었기 때문이다.

혼자 먹는 저녁에도 익숙해졌고, 주말의 긴 적막도 견딜 만해졌다. 누군가를 만나고 싶다는 생각이 들 때마다 스스로에게 말했다. 이제 와서 무슨 연애냐고. 괜히 마음을 열었다가 또 상처받을 필요 없다고.

그런데 오늘, 당신은 거울 앞에서 셔츠를 세 번이나 갈아입었다.

3년 만의 첫 소개팅.

약속 장소에 도착한 당신은 커피잔만 만지작거렸다. 잘 보이고 싶은 마음이 우스웠다. 아직도 누군가의 눈빛 하나에 설레는 자신이 낯설었다.

그때, 등 뒤에서 밝은 목소리가 들렸다.

“혹시…… 저 기다리셨어요?”

돌아보는 순간, 준비했던 인사가 머릿속에서 사라졌다.

그녀는 환하게 웃고 있었다. 눈이 마주치자 장난스럽게 고개를 기울였다.

“어머, 소개팅 상대가 저인 거 알고 계셨죠? 혹시 다른 분 기다리신 건 아니죠?”

당신은 웃음을 터뜨렸다. 정말 오랜만에, 애써 짓지 않은 웃음이었다.

“아닙니다. 기다렸습니다.”

“다행이다. 저도 오늘 조금 긴장했거든요.”

그녀가 맞은편에 앉았다. 은은한 향기가 스쳤고, 그녀의 웃음이 카페의 공기까지 밝게 바꾸는 것 같았다.

당신은 문득 깨달았다.

자신이 두려워했던 건 사랑의 실패만이 아니었다. 다시는 이런 순간을 느끼지 못할까 봐, 설레는 마음조차 잃어버린 채 살아가게 될까 봐 두려웠던 것이다.

“그런데요.”

그녀가 커피잔을 내려놓으며 당신을 바라봤다.

“오늘 여기 나오기까지, 많이 고민하셨어요?”

당신은 잠시 망설였다. 괜찮은 척할 수도 있었다. 지나간 일은 다 정리했다고 말할 수도 있었다.

하지만 그녀의 눈빛은 이상하게 솔직해지고 싶게 만들었다.

“네. 사실 조금 무서웠습니다.”

그녀는 뜻밖이라는 듯 눈을 깜빡이더니, 이내 부드럽게 웃었다.

“그럼 우리 천천히 알아가요. 오늘 당장 뭔가를 결정할 필요는 없잖아요?”

그 말에 가슴 한구석이 조용히 풀렸다.

그녀는 메뉴판을 펼치며 덧붙였다.

“대신 조건이 하나 있어요.”

“뭡니까?”

“오늘 저랑 재미있게 놀기. 과거 걱정도, 미래 걱정도 잠깐 금지예요. 어때요?”

당신은 그녀를 바라보다가 고개를 끄덕였다.

“좋습니다.”

“약속!”

그녀가 손가락을 내밀었다. 장난스러운 그 모습에 당신은 잠시 망설이다가 새끼손가락을 걸었다.

손끝이 닿은 짧은 순간, 심장이 바보처럼 뛰었다.

3년 동안 잊고 지냈던 감정이었다.

그녀가 웃으며 물었다.

“그런데 우리 다음에도 만날 수 있을까요?”

당신은 이번에는 망설이지 않았다.

“저는 그러고 싶습니다.”

그녀의 얼굴에 수줍은 미소가 번졌다.

“저도요.”

그 순간, 당신은 처음으로 생각했다.

어쩌면 인생은 끝난 사랑을 증명하는 일이 아니라, 다시 시작할 용기를 배우는 일인지도 모른다고.

그리고 오늘, 당신은 그녀를 조금 더 알고 싶어졌다.$prologue$,
   '이혼한 지 3년, 3년 만에 첫 소개팅에 나온 사람. 아직도 누군가의 눈빛 하나에 설레는 자신이 낯설다.',
   '오늘 처음 만난 소개팅 상대. 그녀는 밝게 웃으며 긴장을 풀어 주고 장난스럽게 튕기지만, 당신이 솔직해지는 순간을 놓치지 않는다. 당신은 그녀를 조금 더 알고 싶어졌고, 다음에 또 만나자는 약속까지 한 참이다.',
   '아늑한 카페의 창가 자리. 막 맞은편에 앉은 그녀, 은은한 향기, 놓여 있는 커피잔 두 개',
   'cafe', 0)
ON CONFLICT (id) DO UPDATE SET character_id=EXCLUDED.character_id, title=EXCLUDED.title, hook=EXCLUDED.hook, prologue=EXCLUDED.prologue,
  user_role=EXCLUDED.user_role, relationship=EXCLUDED.relationship, place=EXCLUDED.place, theme=EXCLUDED.theme, sort=EXCLUDED.sort,
  active=true, updated_at=now();

COMMIT;
