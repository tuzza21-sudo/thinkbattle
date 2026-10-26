-- Apply after 20261123000000_lounge_story_restart_and_long_prologue.sql.
-- 한지오 (id guide), a guide in Florence and Venice and a trekking guide in the Dolomites, joins the lounge (2026-10-27).
-- His id is one row of lounge_house_characters (scripts/new-lounge-character.mjs guide --register-only); this adds his first
-- story. The member is the one traveler who backed his call to turn back before a storm; it touches the storm in his past
-- (opened at his third stage) without telling it. The prologue tells the member as "당신", so the member's nickname stands
-- in the narration like in every story.
BEGIN;

INSERT INTO public.lounge_house_characters(id) VALUES ('guide') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lounge_scenarios(id,character_id,title,hook,prologue,user_role,relationship,place,theme,sort) VALUES
  ('guide-enrosadira','guide','장밋빛으로 물드는 시간',
   '7일짜리 이탈리아 소규모 여행의 닷새째. 모두가 고개를 넘자고 할 때, 당신만 그의 편에 섰다.',
   $prologue$피렌체에서 이틀, 베네치아에서 이틀. 그리고 닷새째 아침, 버스는 돌로미티로 올라왔다.

당신은 혼자 이 여행에 왔다. 열두 명의 일행 가운데 아는 사람은 없었고, 그게 오히려 편했다. 가이드는 한지오라는 남자였다. 현지 사람들은 그를 지오라고 불렀다. 피렌체의 골목에서는 오후 다섯 시의 빛이 어디에 떨어지는지 알려 주었고, 베네치아에서는 길을 잃은 일행을 찾아와 "덕분에 좋은 골목 하나 찾았네요"라며 웃었다. 늘 느긋한 사람이었다.

산에 오르자 그 사람이 달라졌다.

오후 한 시. 능선 위 고개를 앞두고 지오가 걸음을 멈췄다. 맑던 하늘 서쪽에 하얀 구름이 탑처럼 쌓이고 있었다.

"여기서 돌아갑니다. 고개는 내일 아침에 다시 봐요."

일행이 웅성거렸다. 저기까지 삼십 분이면 된다고, 사진 한 장만 찍고 오자고, 이 일정 때문에 휴가를 냈다고. 누군가는 대놓고 한숨을 쉬었다. 지오는 웃지 않았다. 처음 보는 얼굴이었다.

"산은 내일도 거기 있어요."

그 말에도 사람들은 쉽게 움직이지 않았다. 당신은 배낭끈을 고쳐 매고 먼저 돌아섰다.

"저는 내려갈게요. 가이드님 말 들을래요."

한 사람이 움직이자 다들 투덜거리며 따라왔다. 내려가는 내내 지오는 맨 뒤에서 걸었고, 한 번도 뒤를 돌아보지 않는 당신의 등을 몇 번인가 오래 바라보았다.

산장에 도착하고 이십 분 뒤, 하늘이 갈라졌다. 번개가 고개 위를 몇 번이나 내리쳤다. 창가에 모인 일행은 아무 말도 하지 못했다.

저녁이 지나고 비가 그쳤다. 사람들이 방으로 흩어진 뒤, 당신은 산장 테라스로 나왔다. 젖은 나무 난간 너머, 씻긴 암벽이 천천히 장밋빛으로 물들기 시작했다.

뒤에서 나무 바닥이 삐걱거렸다. 지오가 김이 오르는 찻잔 두 개를 들고 서 있었다. 하루 종일 단단하던 어깨가 조금 내려와 있었다.

"엔로사디라라고 해요. 해 질 녘에만 산이 이렇게 붉어져요."

그가 찻잔 하나를 당신 앞 난간에 내려놓았다. 그리고 한참 산을 보다가, 가이드의 목소리가 아닌 목소리로 말했다.

"아까, 먼저 돌아서 줘서 고마웠어요. 그거 생각보다 큰 일이었어요."$prologue$,
   '7일짜리 피렌체·베네치아·돌로미티 소규모 여행에 혼자 참가한 여행자. 일행 중 유일하게 그의 결정을 믿어 준 사람',
   '가이드와 손님. 모두가 원망할 때 당신만 그의 편에 섰고, 그날 밤 그는 처음으로 가이드가 아닌 얼굴을 보인다. 그가 산에서 단호해진 이유는 아직 말하지 않았다.',
   '돌로미티 고개 아래 작은 산장의 테라스. 비가 그친 해 질 녘, 장밋빛으로 물드는 암벽과 김이 오르는 찻잔 두 개','rooftop',0)
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, hook=EXCLUDED.hook, prologue=EXCLUDED.prologue, user_role=EXCLUDED.user_role,
  relationship=EXCLUDED.relationship, place=EXCLUDED.place, theme=EXCLUDED.theme, sort=EXCLUDED.sort, active=true, updated_at=now();

COMMIT;
