-- 실전 훈련 (2026-11-26, by the owner): 강무진's negotiation training (closercoach) and 백도하's pressure interview
-- (trickstercoach), each a character of its own with its own card, like the English tutors; and each English expression
-- gets its nuance, similar expressions and why Koreans mix it up (filled in by the server, action lesson-enrich).
-- Apply by hand in the Supabase SQL editor (after 20270118000000).
BEGIN;

ALTER TABLE public.lounge_english_items ADD COLUMN IF NOT EXISTS nuance text CHECK (nuance IS NULL OR length(nuance) <= 200);
ALTER TABLE public.lounge_english_items ADD COLUMN IF NOT EXISTS alternatives jsonb CHECK (alternatives IS NULL OR jsonb_typeof(alternatives) = 'array');
ALTER TABLE public.lounge_english_items ADD COLUMN IF NOT EXISTS confusion text CHECK (confusion IS NULL OR length(confusion) <= 300);

INSERT INTO public.lounge_house_characters(id) VALUES ('closercoach'), ('trickstercoach') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lounge_scenarios(id,character_id,title,hook,prologue,user_role,relationship,place,theme,sort) VALUES
  ('closercoach-training','closercoach','협상 훈련',
   '강무진이 상대편을 맡아 실제처럼 밀고 당겨요. 끝나면 상대의 진짜 한계선과 내가 가져온 몫을 숫자로 보여 줘요.',
   $prologue$저녁 일곱 시, 불이 반쯤 꺼진 중역 회의실. 강무진이 긴 테이블 맞은편에 서류철 하나를 내려놓는다.

"협상은 연습할 데가 없어서 다들 실전에서 배웁니다. 비싸게요. 오늘은 싸게 배우죠."

그가 의자를 당겨 앉으며 펜을 돌린다.

"상황은 아래 '훈련 설정'에서 고르세요. 상대는 제가 합니다. 봐주는 거 없습니다."$prologue$,
   '강무진에게 1:1 협상 훈련을 받는 훈련생',
   '코치와 훈련생. 훈련 중에는 협상에만 집중하는 사이다.',
   '저녁의 중역 회의실, 긴 테이블과 서류철 하나','boardroom',0),
  ('trickstercoach-training','trickstercoach','압박 면접',
   '백도하가 면접관이 되어 답의 빈틈을 파고들어요. 끝나면 질문별 점수와 가장 약했던 답의 더 나은 버전을 알려 줘요.',
   $prologue$오후 세 시, 블라인드를 반쯤 내린 회의실. 백도하가 테이블 끝에 앉아 노트를 펼친다.

"첫 질문은 다들 준비해 와요. 면접은 두 번째 질문에서 갈립니다."

그가 펜 끝으로 노트를 톡 친다.

"아래 '훈련 설정'에 지원 직무랑 경력을 넣어 주세요. 공고나 자기소개를 붙이면 그걸로 파고듭니다."$prologue$,
   '백도하에게 1:1 압박 면접 훈련을 받는 지원자',
   '코치와 지원자. 훈련 중에는 면접에만 집중하는 사이다.',
   '오후의 회의실, 반쯤 내린 블라인드와 노트 한 권','boardroom',0)
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, hook=EXCLUDED.hook, prologue=EXCLUDED.prologue, user_role=EXCLUDED.user_role,
  relationship=EXCLUDED.relationship, place=EXCLUDED.place, theme=EXCLUDED.theme, sort=EXCLUDED.sort, active=true, updated_at=now();

COMMIT;
