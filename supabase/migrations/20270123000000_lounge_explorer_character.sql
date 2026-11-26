-- Apply in the Supabase SQL editor (migrations are not applied on merge), before the code that lists 민서하 goes live.
-- 민서하 (id explorer, 2026-11-27, the owner's card), a national-park expedition documentarian, joins the lounge with her own place:
-- 'patagonia', a lakeside camp in Torres del Paine. This adds the place to the theme lists (rooms, spaces, scenarios, custom
-- characters, the background picker and every function that lists places), registers her id in lounge_house_characters and adds
-- her first story card. docs/stories/explorer-patagonia-camp.json carries the same card.
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
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge','winebar','patagonia'));
ALTER TABLE public.voice_lounge_spaces ADD CONSTRAINT voice_lounge_spaces_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge','winebar','patagonia'));
ALTER TABLE public.lounge_scenarios ADD CONSTRAINT lounge_scenarios_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge','winebar','patagonia'));
ALTER TABLE public.lounge_custom_characters ADD CONSTRAINT lounge_custom_characters_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge','winebar','patagonia'));

-- The background picker, as in 20270110000000_lounge_pick_stamp.sql with 'patagonia' added.
CREATE OR REPLACE FUNCTION public.choose_lounge_room_background(p_room text, p_choice jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE picked jsonb; s public.lounge_scene_backgrounds; ep integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF p_choice IS NULL OR jsonb_typeof(p_choice) <> 'object' THEN
    picked := NULL;
  ELSIF p_choice ? 'theme' THEN
    IF p_choice->>'theme' NOT IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge','winebar','patagonia','car','livingroom','bedroom','restaurant','street') THEN
      RAISE EXCEPTION '지원하지 않는 배경이에요.';
    END IF;
    picked := jsonb_build_object('theme', p_choice->>'theme');
  ELSIF p_choice->>'blank' = 'true' THEN
    picked := jsonb_build_object('blank', true);
  ELSIF p_choice ? 'scene' THEN
    SELECT * INTO s FROM public.lounge_scene_backgrounds WHERE id::text = p_choice->>'scene';
    IF NOT FOUND THEN RAISE EXCEPTION '찾을 수 없는 배경이에요.'; END IF;
    picked := jsonb_build_object('scene', s.id, 'image', s.image_path, 'prompt', s.description);
    UPDATE public.lounge_scene_backgrounds SET uses = uses + 1 WHERE id = s.id;
  ELSE
    RAISE EXCEPTION '올바르지 않은 배경이에요.';
  END IF;
  IF picked IS NOT NULL AND jsonb_typeof(p_choice->'episode') = 'number' THEN
    ep := (p_choice->>'episode')::numeric::integer;
    IF ep BETWEEN 1 AND 12 THEN picked := picked || jsonb_build_object('episode', ep); END IF;
  END IF;
  IF picked IS NOT NULL THEN
    picked := picked || jsonb_build_object('picked_at', (extract(epoch FROM clock_timestamp()) * 1000)::bigint);
  END IF;
  UPDATE public.voice_lounge_rooms SET background = picked
    WHERE id=p_room AND host_id=auth.uid() AND capacity=1 AND space_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION '내 1:1 대화에서만 배경을 바꿀 수 있어요.'; END IF;
  RETURN picked;
END $$;
REVOKE ALL ON FUNCTION public.choose_lounge_room_background(text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.choose_lounge_room_background(text,jsonb) TO authenticated;

-- Every other function that lists the places: keep its body, grants and signature, and add 'patagonia' after 'winebar'.
DO $$
DECLARE f record; def text; revised text;
BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
  LOOP
    def := pg_get_functiondef(f.oid);
    IF position('''rooftop''' IN def)>0 AND position('''patagonia''' IN def)=0 THEN
      revised := regexp_replace(def, '(''arnobridge''[[:space:]]*,[[:space:]]*''winebar'')', '\1,''patagonia''', 'g');
      IF revised<>def THEN EXECUTE revised; END IF;
    END IF;
  END LOOP;
END $$;

INSERT INTO public.lounge_house_characters(id) VALUES ('explorer') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lounge_scenarios(id,character_id,title,hook,prologue,user_role,relationship,place,theme,sort) VALUES
  ('explorer-patagonia-camp','explorer','바람이 먼저 도착하는 곳',
   '토레스 델 파이네, 노르덴스킬드 호숫가의 야영지. 원정 사흘째 저녁, 텐트 팩과 씨름하는 당신을 탐험가 민서하가 웃음을 참으며 보고 있다.',
   $prologue$원정 사흘째 저녁. 해가 뿔처럼 솟은 회색 봉우리 뒤로 넘어가자, 청록빛 호수 위로 바람이 먼저 달려왔다. 풀이 한쪽으로 눕고, 당신이 막 박은 텐트 팩 하나가 흙에서 쑥 빠졌다.

돌 위에 놓인 작은 버너에서 물이 끓고 있었다. 그 앞에 쪼그려 앉아 있던 여자가 법랑 컵 두 개에 마테차 잎을 털어 넣다가, 손을 멈추고 당신 쪽을 봤다. 바람에 빠져나온 짙은 갈색 머리칼이 얼굴에 붙었다. 낡은 코발트색 바람막이, 소매를 걷은 올리브색 셔츠. 이 원정을 짠 사람, 민서하다.

"그거 바람 반대 방향이에요."

그녀는 웃음을 참는 얼굴로 다시 컵을 들여다봤다.

"아, 계속하세요. 재밌으니까."

바람이 한 번 더 텐트를 부풀렸다. 서하가 컵을 내려놓고 일어나 당신 옆에 쪼그려 앉더니, 빠진 팩을 주워 손바닥에 올려 보였다.

"농담이고요. 여기 돌풍은 시속 백 킬로미터 넘을 때도 있어요. 팩은 바람 오는 쪽으로 이렇게, 45도로 눕혀서."

그녀가 팩 하나를 흙에 박아 보이고는, 남은 하나를 당신 손에 쥐여 줬다.

"나머지는 당신 거예요. 잘 박으면 차 한 잔, 날아가면 내일 아침 설거지."$prologue$,
   '민서하가 기획한 소규모 파타고니아 원정에 합류한 성인 대원. 무슨 일을 하는 사람인지, 왜 이 원정에 왔는지는 당신이 정한다',
   '원정에서 처음 만나 사흘째인 사이. 서하는 원정 기획자이자 길잡이로, 시원한 해요체로 설명하고 가볍게 놀린다. 호감은 아직 정해지지 않았다.',
   '칠레 파타고니아, 토레스 델 파이네 국립공원 노르덴스킬드 호숫가의 지정 야영지. 해 질 녘, 뿔처럼 솟은 봉우리 아래로 바람이 호수를 건너온다. 공원 전체가 불을 금지해 모닥불 대신 작은 버너 위에서 물이 끓고 있다',
   'patagonia',0)
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, hook=EXCLUDED.hook, prologue=EXCLUDED.prologue, user_role=EXCLUDED.user_role,
  relationship=EXCLUDED.relationship, place=EXCLUDED.place, theme=EXCLUDED.theme, sort=EXCLUDED.sort, active=true, updated_at=now();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lounge_house_characters WHERE id='explorer')
     OR NOT EXISTS (SELECT 1 FROM public.lounge_scenarios WHERE id='explorer-patagonia-camp' AND character_id='explorer' AND active) THEN
    RAISE EXCEPTION '민서하 was not registered with her story card';
  END IF;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
