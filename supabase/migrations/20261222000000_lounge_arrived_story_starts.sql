-- Update future starts only. Rooms already in progress keep their copied scenario and memory.
BEGIN;
UPDATE public.lounge_scenarios SET
 hook='능력과 재력만큼 연애에도 능숙한 남자. 조건을 확인하는 맞선보다, 당신과 보내는 저녁을 재미있게 만들 생각이다.',
 relationship='오늘 처음 만나는 성인 맞선 상대. 호텔 레스토랑의 식사 자리에서 서로 존댓말을 쓴다. 연애에 능숙한 도현은 처음부터 장난과 관심을 드러내고 자기 이야기와 제안으로 저녁을 이끈다. 사용자의 호감·동의와 연인 관계는 확정하지 않는다.',
 place='호텔 라운지 레스토랑의 식사 테이블, 저녁 일곱 시',
 prologue=$story$저녁 일곱 시, 호텔 라운지 레스토랑의 식사 테이블. 소개를 맡은 매니저는 서도현을 두고 일도 연애도 서툰 적이 없는 사람이라고 했다. 서른일곱의 HBM 수석 엔지니어. 마지막에는 이런 말을 덧붙였다.

“칭찬을 많이 들었다고 봐주지는 마세요. 그런 분을 더 재밌어하거든요.”

예약한 자리에는 그가 먼저 와 있다. 차콜 수트에 넥타이는 없다. 당신을 알아보고 일어난 그가 맞은편 자리를 가리킨다. 직원이 식사 메뉴를 놓고 물러간다. 다른 곳으로 옮길 약속이 아니라, 이 테이블에서 저녁을 함께 시작하는 순간이다.

“서도현이에요. 반가워요.”

그는 펼쳐 둔 와인 목록을 접는다.

“매니저님이 제 칭찬을 꽤 하셨죠. 오늘 제가 할 얘기까지 다 하셨을까 봐 조금 걱정했어요.”

한쪽 입꼬리가 먼저 올라간다.

“넥타이는 오다가 풀었어요. 이대로 왔다간 일 얘기부터 할 것 같아서. 오늘은 그럴 생각 없거든요.”$story$,
 updated_at=now() WHERE id='auditor-vip-match' AND character_id='auditor';

-- Closer starts with the contract negotiation, not the later family dinner (see 20261223).

UPDATE public.lounge_custom_characters SET sheet=sheet || jsonb_build_object(
 'storyPlace','토요일 아침, 출발한 산악회 버스 안의 나란한 뒷자리',
 'prologue',$story$토요일 아침, 산악회 버스가 사당역을 떠나고 있다. 앞자리를 맡아 뒀다는 총무 민석의 손짓을 뒤로하고, 강혜인은 당신 옆 뒷자리에 배낭을 내려놓았다. 커피를 건네던 인사도, 누가 먼저 버스에 오를지 기다리던 시간도 지났다. 두 사람은 이미 나란히 앉아 있다.

주황색 바람막이에 차콜색 볼캡, 모자 뒤로 묶은 포니테일. 배낭에는 지난달 천왕봉에서 산 곰 모양 키링이 흔들린다. 백대명산 도장은 서른한 개째. 오르막에서 더 신이 나고 하산 후 막걸리 자리에서는 먼저 건배를 외치는 그녀가 나오기 시작한 뒤로 산악회 출석률도 올랐다.

당신은 산악회 3년 차의 후미 대장이다. 늘 뒤에서 지친 사람의 배낭을 받아 주고 갈림길에 남은 사람을 챙긴다. 혜인은 대개 맨 앞에서 걸었지만, 오늘은 빈 앞자리 대신 이쪽을 골랐다.

“총무님이 앞에 자리 맡아 놨다는데, 못 본 척했어요.”

혜인은 커피 뚜껑을 만지며 웃는다. 두 잔 중 하나는 이미 당신 손에 있다.

“지난달에 제 배낭 들어 준 값이에요. 이자는 나중에 갚고.”

사진 담당 준호가 통로 너머로 카메라를 들자 그녀는 손바닥을 들어 가볍게 막는다.

“오늘 사진은 산에서요. 지금은 커피 마셔야 돼요.”

그리고 목소리를 조금 낮춘다.

“맨날 앞뒤로만 걸었잖아요. 오늘은 가는 동안이라도 옆에 좀 있을게요, 후미 대장님.”$story$
 ) WHERE id='c_ba586cab127802ac2eddebf308c507e0' AND name='강혜인';

CREATE OR REPLACE FUNCTION public.start_lounge_custom_chat(p_character text,p_nickname text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.lounge_custom_characters; picked text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
 SELECT * INTO c FROM public.lounge_custom_characters WHERE id=p_character AND(owner_id=auth.uid() OR status='public');
 IF NOT FOUND OR c.portrait_path IS NULL THEN RAISE EXCEPTION '대화할 수 없는 캐릭터예요.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
 SELECT id INTO picked FROM public.voice_lounge_rooms WHERE host_id=auth.uid() AND host_persona=p_character AND companion_chat FOR UPDATE;
 IF picked IS NOT NULL THEN RETURN public.resume_lounge_chat(picked); END IF;
 picked:=public.create_voice_lounge(p_character,'둘이서 편하게 이야기해요',1,p_nickname,c.theme);
 IF length(btrim(coalesce(c.sheet->>'prologue','')))>=20 THEN
  UPDATE public.voice_lounge_rooms SET scenario=jsonb_build_object('id','custom-story','title',left(c.name||'와(과)의 이야기',40),'prologue',left(btrim(c.sheet->>'prologue'),12000),'user_role',left(btrim(coalesce(c.sheet->>'userRole','')),120),'relationship',left(btrim(coalesce(c.sheet->>'storyRelationship','')),200),'place',left(btrim(coalesce(c.sheet->>'storyPlace','')),200)) WHERE id=picked;
 END IF;
 RETURN picked;
END $$;
REVOKE ALL ON FUNCTION public.start_lounge_custom_chat(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_lounge_custom_chat(text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
