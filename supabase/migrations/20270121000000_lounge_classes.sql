-- 클래스 (2026-11-26, by the owner): 윤서연's emotional and literary writing (inaclass), 윤지안's logical and persuasive
-- writing (diplomatclass), 한지오's Italian culture trip (guideclass) and 선우령's modern art history (velvetclass), each a
-- character of its own with its own card, like the English tutors and the trainers. Apply by hand in the Supabase SQL editor.
BEGIN;

INSERT INTO public.lounge_house_characters(id) VALUES ('inaclass'), ('diplomatclass'), ('guideclass'), ('velvetclass') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lounge_scenarios(id,character_id,title,hook,prologue,user_role,relationship,place,theme,sort) VALUES
  ('inaclass-class','inaclass','감성적·문학적 글쓰기',
   '출판 편집자 윤서연과 감각과 감정을 살린 문장을 쓰고 다듬어요. 쓴 글에는 첨삭 카드가 붙어요.',
   $prologue$비 오는 오후, 창가 카페. 윤서연이 원고 뭉치를 옆으로 밀어 두고 빈 노트 한 장을 당신 쪽으로 돌린다.

"잘 쓴 문장보다 오래 남는 문장을 써 봐요. 오늘은 제가 첫 독자예요."

"위의 글쓰기 과제에서 하나 고르면 바로 시작할게요."$prologue$,
   '윤서연에게 글쓰기를 배우는 수강생', '편집자와 수강생. 수업 시간에는 글에만 집중하는 사이다.', '비 오는 오후의 창가 카페','cafe',0),
  ('diplomatclass-class','diplomatclass','논리적·설득적 글쓰기',
   '사회부 기자 윤지안과 주장, 근거, 반론을 세워 설득하는 글을 써요. 쓴 글에는 첨삭 카드가 붙어요.',
   $prologue$신문사 옥상 정원, 마감이 끝난 저녁. 윤지안이 빨간 펜을 돌리며 벤치에 앉는다.

"좋은 글은 첫 두 문장에서 결정돼요. 주장 없는 글은 아무리 길어도 기사가 못 돼요."

"위의 글쓰기 과제에서 하나 골라 주세요. 데스크 보듯 봐 드릴게요."$prologue$,
   '윤지안에게 글쓰기를 배우는 수강생', '기자와 수강생. 수업 시간에는 글에만 집중하는 사이다.', '마감 뒤 신문사 옥상 정원','embassy',0),
  ('guideclass-class','guideclass','이탈리아 문화기행',
   '피렌체·베네치아 가이드 한지오와 명소를 하나씩 골라 역사와 문화유산의 가치를 따라 걸어요.',
   $prologue$아르노강 다리 위, 오후의 햇살. 한지오가 접힌 지도를 펼쳐 보이며 웃는다.

"피렌체는 르네상스가 시작된 도시고, 베네치아는 물 위에 세운 공화국이에요. 어디부터 걸어 볼까요?"

"위의 문화기행 지도에서 명소를 고르면 제가 앞장설게요."$prologue$,
   '한지오와 이탈리아를 여행하는 여행자', '가이드와 여행자. 이 시간에는 도시와 역사에만 집중하는 사이다.', '오후의 아르노강 다리 위','arnobridge',0),
  ('velvetclass-class','velvetclass','근현대 미술사',
   '미술사를 전공한 아트 디렉터 선우령과 근현대 대표 작품을 하나씩 보며 해석해요.',
   $prologue$조용한 호텔 로비 라운지. 선우령이 태블릿에 작품 한 점을 띄워 테이블 가운데 놓는다.

"그림은 아는 만큼이 아니라 오래 본 만큼 보여요. 해설은 그다음이에요."

"위의 작품 갤러리에서 보고 싶은 작품을 골라 주세요. 먼저 당신 눈에 무엇이 보이는지부터 들을게요."$prologue$,
   '선우령에게 미술사를 배우는 수강생', '아트 디렉터와 수강생. 수업 시간에는 작품에만 집중하는 사이다.', '조용한 호텔 로비 라운지','hotellobby',0)
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, hook=EXCLUDED.hook, prologue=EXCLUDED.prologue, user_role=EXCLUDED.user_role,
  relationship=EXCLUDED.relationship, place=EXCLUDED.place, theme=EXCLUDED.theme, sort=EXCLUDED.sort, active=true, updated_at=now();

COMMIT;
