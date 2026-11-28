-- Apply in the Supabase SQL editor (migrations are not applied on merge), before the code that lists 아사쿠라 미오 goes live.
-- 아사쿠라 미오 (id mio, 2026-11-28, the owner's bible "일본 소도시 기행"), a Japanese local-culture writer and the first travel
-- companion (her trip board is in her own story room), joins the lounge with her own place: 'inebay', the funaya boathouses of Ine
-- Bay in northern Kyoto. This adds the place to the theme lists (rooms, spaces, scenarios, custom characters, the background picker
-- and every function that lists places), registers her id in lounge_house_characters and adds her first story card (no episodes:
-- her room's story_state holds the trip). docs/stories/mio-ine-funaya.json carries the same card.
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
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge','winebar','patagonia','inebay'));
ALTER TABLE public.voice_lounge_spaces ADD CONSTRAINT voice_lounge_spaces_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge','winebar','patagonia','inebay'));
ALTER TABLE public.lounge_scenarios ADD CONSTRAINT lounge_scenarios_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge','winebar','patagonia','inebay'));
ALTER TABLE public.lounge_custom_characters ADD CONSTRAINT lounge_custom_characters_theme_check CHECK (
  theme IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge','winebar','patagonia','inebay'));

-- The background picker, as in 20270123000000_lounge_explorer_character.sql with 'inebay' added.
CREATE OR REPLACE FUNCTION public.choose_lounge_room_background(p_room text, p_choice jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE picked jsonb; s public.lounge_scene_backgrounds; ep integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF p_choice IS NULL OR jsonb_typeof(p_choice) <> 'object' THEN
    picked := NULL;
  ELSIF p_choice ? 'theme' THEN
    IF p_choice->>'theme' NOT IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge','winebar','patagonia','inebay','car','livingroom','bedroom','restaurant','street') THEN
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

-- Every other function that lists the places: keep its body, grants and signature, and add 'inebay' after 'patagonia'.
DO $$
DECLARE f record; def text; revised text;
BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
  LOOP
    def := pg_get_functiondef(f.oid);
    IF position('''patagonia''' IN def)>0 AND position('''inebay''' IN def)=0 THEN
      revised := regexp_replace(def, '(''winebar''[[:space:]]*,[[:space:]]*''patagonia'')', '\1,''inebay''', 'g');
      IF revised<>def THEN EXECUTE revised; END IF;
    END IF;
  END LOOP;
END $$;

INSERT INTO public.lounge_house_characters(id) VALUES ('mio') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lounge_scenarios(id,character_id,title,hook,prologue,user_role,relationship,place,theme,sort) VALUES
  ('mio-ine-funaya','mio','교토에서 가장 먼 교토',
   '교토 북쪽 끝, 바다가 현관 앞까지 오는 이네의 후나야 마을. 소도시 기록가 아사쿠라 미오가 녹음기 이어폰 한쪽을 건넨다. 여기서 시작해, 지도에서 고른 일본의 마을들을 함께 걷는다.',
   $prologue$늦은 오후, 교토 북쪽 끝 이네만.

수면에 닿을 듯 늘어선 목조 배 창고 집들의 그림자가 바다 위에 길게 흔들린다. 작은 어선 한 척이 지나가자 잔물결이 처마 밑까지 밀려왔다가 물러난다.

"여기가 교토라고 하면 믿겨요?"

옆에 서 있던 여자가 웃는다. 베이지색 셔츠 소매를 한 번 걷어 올리고, 낡은 소형 녹음기의 버튼을 누른다.

"보통 교토라고 하면 기요미즈데라나 기온부터 떠올리잖아요. 근데 여기 사람들은 아침에 문을 열면 바다가 바로 보여요. 조금 다른 교토죠."

그녀는 자기를 아사쿠라 미오라고 소개한다. 일본 소도시를 기록하는 지역문화 기록가. 한국어가 놀랄 만큼 자연스럽다. 서울에서 4년쯤 살았다고, 유명한 가게보다 오래된 동네 식당을 더 좋아한다고 덧붙인다.

미오가 당신에게 작은 이어폰 한쪽을 건넨다. 녹음기에서 찰박, 찰박 하는 물소리와 멀리서 나무를 두드리는 소리가 흘러나온다.

"오늘 아침에 녹음한 거예요. 다들 풍경을 찍는데, 저는 여기서 나는 소리가 더 좋거든요."

그때 둘이 서 있던 골목 안쪽으로 카메라를 든 관광객 하나가 성큼 들어선다. 미오가 말을 멈춘다.

"잠깐만요. 저쪽은 주민 집이라 허락 없이 들어가면 안 되는데."

미오가 정중하게 길을 안내하고 돌아온다. 표정에 아까보다 약간의 피로가 묻어 있다.

"이래서 유명한 동네를 소개하는 걸 가끔 망설여요. 이상하죠? 좋아서 알리고 싶은데, 좋아하니까 조용히 두고 싶기도 하거든요."

잠시 후 그녀가 손목시계를 본다.

"아직 식당 닫을 시간은 아니겠네. 바다를 조금 더 보고 가도 되고, 근처에서 오늘 들어온 생선부터 먹어 봐도 돼요."

미오가 한쪽 입꼬리를 올린다.

"근데 하나는 먼저 묻고 싶어요. 당신은 여행지에서 뭘 더 오래 기억해요? 풍경이에요, 아니면 거기서 만난 사람이나 음식이에요?"$prologue$,
   '한국에서 일본 소도시를 여행하러 온 성인 여행자. 무슨 일을 하는 사람인지, 왜 이 여행을 왔는지는 당신이 정한다',
   '이네만 물가에서 방금 처음 만난 사이. 미오는 동네를 잘 아는 취재자로, 차분한 해요체로 자기 취향과 이 마을 이야기를 먼저 건넨다. 호감은 아직 정해지지 않았다.',
   '교토부 북쪽 끝 이네만, 늦은 오후. 바다에 바로 붙은 목조 배 창고 집 후나야가 줄지어 서 있고, 잔물결이 처마 밑까지 닿는다. 골목 안쪽은 주민의 집이다',
   'inebay',0)
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, hook=EXCLUDED.hook, prologue=EXCLUDED.prologue, user_role=EXCLUDED.user_role,
  relationship=EXCLUDED.relationship, place=EXCLUDED.place, theme=EXCLUDED.theme, sort=EXCLUDED.sort, active=true, updated_at=now();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lounge_house_characters WHERE id='mio')
     OR NOT EXISTS (SELECT 1 FROM public.lounge_scenarios WHERE id='mio-ine-funaya' AND character_id='mio' AND active) THEN
    RAISE EXCEPTION '아사쿠라 미오 was not registered with her story card';
  END IF;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
