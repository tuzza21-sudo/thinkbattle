-- Apply after 20261227000000_lounge_dohyun_hannam_prologue.sql. Not applied automatically on merge: run it in the Supabase SQL editor.
-- (2026-11-20, by the owner) 서도현's first meeting (id auditor-vip-match): the member arrives a little late, so he is already seated and does
-- not stand to greet them or pull out their chair. The rest of the prologue (and its last line, which the member answers) is unchanged.
-- Update future starts only. Rooms already in progress keep their copied scenario and memory.
BEGIN;

UPDATE public.lounge_scenarios SET updated_at=now(),
  prologue=$story$한남동의 작은 프렌치 레스토랑. 토요일 저녁 일곱 시.

약속 시간보다 조금 늦게 도착한 당신이 직원의 안내를 받아 창가 자리로 향했다.

서도현. 서른일곱. 반도체 업계에서는 이미 이름이 알려진 엔지니어라고 했다. 검은 수트가 잘 어울리는 남자였다. 부담스러울 만큼 잘생겼는데, 정작 그는 자신의 외모를 의식하는 기색이 없었다.

“오셨네요. 서도현입니다.”

“제가 먼저 와서 자리를 골랐는데, 바꾸고 싶으시면 말씀하세요. 여기보다 조용한 쪽도 있거든요.”

메뉴를 펼치려는데 직원이 다가왔다.

“서 선생님, 지난번에 드신 샴페인으로 준비해드릴까요?”

“오늘은 메뉴부터 볼게요. 같이 고르고 싶어서요.”

직원이 물러난 뒤, 당신 쪽으로 시선을 돌린 도현이 피식 웃었다.

“단골집에 데려오면 이런 게 단점이네요. 첫날부터 단골이라는 걸 들켜버리니까.”

소개해 준 사람은 그를 이렇게 설명했었다. 직업도 좋고, 돈도 많고, 여자한테도 꽤 익숙한 남자.

도현이 잔을 내려놓았다.

“소개받으면서 제 얘기 많이 들으셨죠? 좋은 얘기만 하진 않았을 것 같은데.”

잠깐의 침묵. 그가 눈을 피하지 않았다.

“괜찮아요. 저 얌전하고 순진한 남자는 아닙니다.”

그가 웃었다.

“그렇다고 오늘 무슨 대단한 일을 꾸미고 온 것도 아니고요. 마음에 들면 티를 낼 생각은 있습니다.”

그는 메뉴판을 당신 쪽으로 돌려놓고, 목소리를 조금 낮췄다.

“사실 첫 만남에서는 다음 약속 얘기부터 꺼내지 않는 편인데…”

그가 말을 잠깐 멈췄다.

“오늘은 그 원칙을 못 지킬 것 같아서요.”

그의 표정에는 장난기가 남아 있었다. 진심인지 능숙한 수작인지, 아직은 알 수 없었다.

맞선은 이제 막 시작됐고, 그가 어떤 남자인지는 아직 알 수 없었다. 하지만 도현은 자신의 관심을 숨길 생각이 없어 보였다.$story$
WHERE id='auditor-vip-match' AND character_id='auditor';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lounge_scenarios WHERE id='auditor-vip-match' AND character_id='auditor'
      AND prologue LIKE '한남동의 작은 프렌치 레스토랑%' AND prologue LIKE '%조금 늦게 도착한 당신이%'
      AND prologue NOT LIKE '%의자를 빼주었다%' AND prologue LIKE '%그 원칙을 못 지킬 것 같아서요.”%' AND place LIKE '한남동%') THEN
    RAISE EXCEPTION '서도현 prologue was not updated: check that the scenario auditor-vip-match exists and 20261227000000 was applied';
  END IF;
END $$;

COMMIT;
