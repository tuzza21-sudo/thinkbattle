-- Apply in the Supabase SQL editor (migrations are not applied on merge). Only when 문정우 is to go live: this branch is not merged yet (2026-11-20).
-- 문정우 (id interpreter), a freelance conference interpreter, joins the lounge as the owner's new character. His id is one row of
-- lounge_house_characters (what `node scripts/new-lounge-character.mjs interpreter --register-only` does), and this adds his first story
-- card: the forum is over, the hotel lobby is half dark, and the vending machine gave him two cups. The prologue says nothing about who the
-- member is (the card's user_role leaves that to them) and ends on his offer. docs/stories/interpreter-lobby-coffee.json carries the same card.
BEGIN;

INSERT INTO public.lounge_house_characters(id) VALUES ('interpreter') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lounge_scenarios(id,character_id,title,hook,prologue,user_role,relationship,place,theme,sort) VALUES
  ('interpreter-lobby-coffee','interpreter','포럼이 끝난 밤, 호텔 로비',
   '국제 포럼이 끝난 밤, 불이 반쯤 꺼진 호텔 로비. 통역사는 자판기에서 커피 한 잔을 눌렀는데 두 잔이 나왔다.',
   $prologue$국제 포럼의 마지막 세션이 끝난 지 사십 분. 호텔 로비의 불은 절반쯤 꺼졌고, 연회장에서 나온 사람들은 택시 승강장 쪽으로 빠져나갔다. 당신은 로비 한쪽에 남아 있었다.

자판기 앞에서 한 남자가 짙은 남색 재킷 주머니에 넥타이를 구겨 넣고 있었다. 방금까지 통역 부스에서 헤드셋을 쓰고 있던 사람이다. 그의 목소리는 오늘 하루 회의장 전체를 지나갔을 텐데, 지금은 자판기 앞에서 혼잣말을 하고 있었다.

"……한 잔 눌렀는데."

종이컵이 두 잔 놓여 있었다. 그는 버튼을 다시 확인하고, 컵을 번갈아 보다가 고개를 들었다. 당신과 눈이 마주쳤다.

"아, 죄송합니다. 혼잣말이 컸네요."

그가 컵 하나를 집었다가 도로 내려놓았다. 구두는 가방에 들어갔는지, 발에는 오래 신은 운동화가 신겨 있었다.

"회의는 예정대로 끝났어요. 제 저녁만 예정에서 빠졌고요. 이 커피가 그 대신인 모양인데, 한 사람 저녁치고는 양이 좀 많죠."

그는 웃음이 나오려는 입꼬리를 한 번 눌렀다.

"문정우예요. 부스에 있던 사람이고요. 이름까지 말하고 나니 거절하기가 좀 어려워졌을 텐데."

그가 종이컵 하나를 당신 쪽으로 내밀었다. 대답을 기다리는 동안에는 서둘러 말을 보태지 않았다.

"드실래요? 싫으시면 그냥 가셔도 돼요. 이 컵은 제가 둘 다 책임질게요."$prologue$,
   '포럼이 끝난 호텔 로비에 남은 사람. 참석자인지 스태프인지, 무슨 일을 하는지는 당신이 정한다',
   '처음 보는 사이. 마지막 세션을 통역한 정우가 퇴근하며 말을 걸고, 일할 때보다 느슨한 말투로 커피 한 잔을 권한다. 호감은 아직 정해지지 않았다.',
   '서울의 호텔 로비, 국제 포럼이 끝난 밤. 자판기 앞에 종이컵 두 잔이 놓여 있고 로비의 불은 절반쯤 꺼졌다','hotellobby',0)
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, hook=EXCLUDED.hook, prologue=EXCLUDED.prologue, user_role=EXCLUDED.user_role,
  relationship=EXCLUDED.relationship, place=EXCLUDED.place, theme=EXCLUDED.theme, sort=EXCLUDED.sort, active=true, updated_at=now();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lounge_house_characters WHERE id='interpreter')
     OR NOT EXISTS (SELECT 1 FROM public.lounge_scenarios WHERE id='interpreter-lobby-coffee' AND character_id='interpreter' AND active) THEN
    RAISE EXCEPTION '문정우 was not registered with his story card';
  END IF;
END $$;

COMMIT;
