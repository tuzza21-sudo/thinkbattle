-- Apply after the existing place migrations and before deploying the winebar theme.
-- New starts use the revised teacher story. Existing rooms retain their scenario and progress.
BEGIN;

DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
    WHERE contype='c' AND conrelid IN ('public.voice_lounge_rooms'::regclass,'public.voice_lounge_spaces'::regclass,'public.lounge_scenarios'::regclass,'public.lounge_custom_characters'::regclass)
      AND pg_get_constraintdef(oid) LIKE '%theme%' AND pg_get_constraintdef(oid) LIKE '%rooftop%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_rooms_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge','winebar'));
ALTER TABLE public.voice_lounge_spaces ADD CONSTRAINT voice_lounge_spaces_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge','winebar'));
ALTER TABLE public.lounge_scenarios ADD CONSTRAINT lounge_scenarios_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge','winebar'));
ALTER TABLE public.lounge_custom_characters ADD CONSTRAINT lounge_custom_characters_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge','winebar'));

-- Preserve current function bodies, grants, security settings and signatures.
-- Extend only the known consecutive place-list entries, including the manual background picker.
DO $$
DECLARE f record; def text; revised text;
BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
  LOOP
    def := pg_get_functiondef(f.oid);
    IF position('''rooftop''' IN def)>0 AND position('''winebar''' IN def)=0 THEN
      revised := regexp_replace(def, '(''theater''[[:space:]]*,[[:space:]]*''arnobridge'')', '\1,''winebar''', 'g');
      IF revised<>def THEN EXECUTE revised; END IF;
    END IF;
  END LOOP;
END $$;

INSERT INTO public.lounge_scenarios (id,character_id,title,hook,user_role,relationship,place,theme,prologue,sort,active,updated_at)
VALUES ('teacher-after-the-lecture',
  'teacher',
  '퇴근 후, 와인바의 옆자리',
  '잔잔한 재즈가 흐르는 와인바. 퇴근 후 화이트 와인을 마시던 성인 영어 강사 정하린이 옆자리의 당신에게 먼저 말을 건다.',
  '와인바 바 테이블의 옆자리에 앉은 성인 손님. 정하린과는 처음 만난 사이이며 그녀의 수강생이 아니다.',
  '와인바 옆자리에서 우연히 처음 만난 성인 사이. 정하린은 퇴근 후 쉬는 중이며, 편안한 해요체와 가벼운 장난으로 먼저 말을 건다. 함께 시간을 보낼지는 대화하며 정한다.',
  '밤, 잔잔한 재즈와 낮은 조명이 흐르는 분위기 있는 와인바의 바 테이블. 두 사람은 옆자리에 앉아 있고, 화이트 와인 잔과 작은 올리브 접시가 놓여 있다.',
  'winebar',
  $story$*잔잔한 재즈가 흐르는 와인바. 바 테이블에 앉아 메뉴를 펼치자, 옆자리 여자가 휴대폰을 뒤집어 내려놓는다. 재킷은 의자 등받이에 걸쳐 두었고, 손에는 화이트 와인 잔이 들려 있다.*

“그거, 설명 읽으면 더 못 고르겠던데.”

*그녀가 메뉴 한쪽을 가볍게 가리킨다.*

“저도 한참 보다가 결국 늘 마시던 걸로 시켰어요. 새로운 걸 시도하러 와서 아주 익숙한 선택을 했죠.”

*눈이 마주치자 그녀가 살짝 웃는다. 어디선가 본 듯한 얼굴. 학원 광고판 속 단정한 모습보다 표정이 훨씬 느슨하지만, 또렷한 목소리는 그대로다. 성인 영어 강사, 정하린.*

*바텐더가 작은 접시에 올리브를 내놓으며 묻는다.*

“선생님, 오늘은 일찍 끝나셨네요?”

“그래서 지금 아주 소중한 시간이에요. 퇴근한 사람으로 좀 살게 해주세요.”

*웃으며 대꾸한 하린이 접시를 두 자리 사이로 조금 옮긴다.*

“같이 드실래요? 여기 올리브가 괜찮아요.”

*그녀는 잔을 내려놓고 당신 쪽으로 몸을 살짝 돌린다.*

“오늘은 조용히 한잔하러 왔어요, 아니면 옆에서 누가 말 걸어도 괜찮은 날이에요?”

*입가에 작은 장난기가 걸린다.*

“저는 일단 말 걸고 싶어서 걸었는데.”$story$,0,true,now())
ON CONFLICT (id) DO UPDATE SET
  title=EXCLUDED.title,
  hook=EXCLUDED.hook,
  user_role=EXCLUDED.user_role,
  relationship=EXCLUDED.relationship,
  place=EXCLUDED.place,
  theme=EXCLUDED.theme,
  prologue=EXCLUDED.prologue,
  updated_at=now()
WHERE lounge_scenarios.character_id=EXCLUDED.character_id;

NOTIFY pgrst,'reload schema';
COMMIT;
