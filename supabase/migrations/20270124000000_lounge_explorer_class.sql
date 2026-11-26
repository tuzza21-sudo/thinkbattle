-- 세계 국립공원 탐험 (2026-11-27, by the owner): 민서하's class, a character id of its own (explorerclass) like the other four
-- classes (20270121000000_lounge_classes.sql), with its story card in her Patagonia camp. The two rows are data only, so they
-- were written through the service key when the class was added; this file keeps them with the code. Running it again is safe.
BEGIN;

INSERT INTO public.lounge_house_characters(id) VALUES ('explorerclass') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lounge_scenarios(id,character_id,title,hook,prologue,user_role,relationship,place,theme,sort) VALUES
  ('explorerclass-class','explorerclass','세계 국립공원 탐험',
   '탐험 다큐멘터리스트 민서하와 세계의 국립공원을 하나씩 골라 지질과 역사, 풍경을 따라 걸어요.',
   $prologue$파타고니아 호숫가 야영지, 바람이 잦아든 저녁. 민서하가 낡은 종이 지도를 돌 위에 펼치고 모서리를 법랑 컵으로 눌러 둔다. 지도 위에는 연필로 동그라미 열두 개가 그려져 있다.

"옐로스톤은 땅이 끓고, 그랜드캐니언은 지구 단면이고, 여기 파타고니아는 바람이 먼저 와요. 다 다르게 이상한 곳들이에요."

"위의 국립공원 지도에서 하나 골라요. 제가 먼저 가서 길 봐 둘게요."$prologue$,
   '민서하와 세계의 국립공원을 탐험하는 여행자', '탐험가와 여행자. 이 시간에는 풍경과 그 땅의 이야기에만 집중하는 사이다.', '바람이 잦아든 저녁, 파타고니아 호숫가 야영지','patagonia',0)
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, hook=EXCLUDED.hook, prologue=EXCLUDED.prologue, user_role=EXCLUDED.user_role,
  relationship=EXCLUDED.relationship, place=EXCLUDED.place, theme=EXCLUDED.theme, sort=EXCLUDED.sort, active=true, updated_at=now();

COMMIT;
