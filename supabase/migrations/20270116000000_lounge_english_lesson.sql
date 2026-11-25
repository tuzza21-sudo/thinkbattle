-- Apply in the Supabase SQL editor (migrations are not applied on merge), after 20270113000000_lounge_interpreter_character.sql
-- (문정우's own page and story; the lesson below does not need it, but his page shows the lesson button).
--
-- 영어 수업 (2026-11-25, by the owner): 정하린 and 문정우 teach a member's English, on a call or in a chat (see
-- src/lib/loungeLesson.ts). A lesson is apart from the stories: each tutor is a character id of its own, so the lesson
-- has its own room, record and chat in the list, and deleting it touches nothing of the story.
--   - lounge_house_characters: teachertutor, interpretertutor
--   - lounge_scenarios: each tutor's lesson card ("영어 수업"), which opens the lesson room
--   - lounge_english_items: the member's expressions and where each stands (0 새 표현 … 5 내 것), the same for both tutors.
--     A member adds and deletes their own; the stages move only in a lesson (the server key writes them).
--   - lounge_english_attempts: each try and correction of a lesson, for the 단어장's "고친 문장"
--   - lounge_english_profiles: the member's level (B1 → B2, or B2 → C1)
BEGIN;

INSERT INTO public.lounge_house_characters(id) VALUES ('teachertutor'), ('interpretertutor') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lounge_scenarios(id,character_id,title,hook,prologue,user_role,relationship,place,theme,sort) VALUES
  ('teachertutor-lesson','teachertutor','영어 수업',
   '배운 표현을 눈으로 말고 입으로 확인하는 1:1 수업. 정하린이 상황만 주고, 당신이 직접 말하게 해요.',
   $prologue$비 오는 오후, 창가 카페의 구석 테이블. 수업 노트 한 권과 커피 두 잔이 놓여 있다. 정하린이 의자를 당겨 앉으며 노트를 당신 쪽으로 돌린다.

"오늘 방식은 간단해요. 제가 상황을 하나 주면, 당신이 영어로 말해요. 제가 답을 먼저 말하는 일은 없어요. 틀려도 괜찮아요. 고치는 건 제 일이니까."

그녀가 펜 끝으로 테이블을 가볍게 두드린다.

"Before we start, how was your day? 영어로, 짧게라도요."$prologue$,
   '정하린에게 1:1 영어 수업을 받는 수강생',
   '튜터와 수강생. 수업 시간에는 영어에만 집중하는 사이다.',
   '비 오는 오후, 창가 카페의 구석 테이블. 수업 노트와 커피 두 잔','cafe',0),
  ('interpretertutor-lesson','interpretertutor','영어 수업',
   '아는 말과 입에서 나오는 말의 차이를 메우는 1:1 수업. 문정우가 상황만 주고, 당신이 직접 말하게 해요.',
   $prologue$일정이 없는 날 오후, 호텔 로비 카페. 문정우가 노트 한 권과 펜을 테이블에 내려놓는다.

"통역하면서 제일 많이 배운 건, 아는 말과 입에서 나오는 말이 다르다는 거였어요. 그래서 오늘은 제가 상황만 드릴게요. 말은 그쪽이 하고요."

그가 커피잔을 조금 옆으로 밀고, 대답을 기다리는 사람처럼 등을 기댄다.

"Let's warm up first. What did you do today? 짧아도 괜찮아요."$prologue$,
   '문정우에게 1:1 영어 수업을 받는 수강생',
   '튜터와 수강생. 수업 시간에는 영어에만 집중하는 사이다.',
   '호텔 로비 카페, 일정이 없는 날 오후. 노트 한 권과 커피','hotellobby',0)
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, hook=EXCLUDED.hook, prologue=EXCLUDED.prologue, user_role=EXCLUDED.user_role,
  relationship=EXCLUDED.relationship, place=EXCLUDED.place, theme=EXCLUDED.theme, sort=EXCLUDED.sort, active=true, updated_at=now();

CREATE TABLE IF NOT EXISTS public.lounge_english_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expression text NOT NULL CHECK (length(btrim(expression)) BETWEEN 1 AND 120),
  -- One expression once per member, whatever its spacing or case.
  expression_key text GENERATED ALWAYS AS (lower(regexp_replace(btrim(expression), '\s+', ' ', 'g'))) STORED,
  meaning text NOT NULL DEFAULT '' CHECK (length(meaning) <= 200),
  level text NOT NULL DEFAULT 'B2' CHECK (level IN ('B1','B2','C1')),
  source text NOT NULL DEFAULT 'mine' CHECK (source IN ('mine','tutor','upgrade')),
  pack_id text CHECK (pack_id IS NULL OR length(pack_id) <= 60),
  stage smallint NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 5),
  days text[] NOT NULL DEFAULT '{}' CHECK (cardinality(days) <= 6),
  free_used boolean NOT NULL DEFAULT false,
  next_review_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_said text CHECK (last_said IS NULL OR length(last_said) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, expression_key)
);
ALTER TABLE public.lounge_english_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_english_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.lounge_english_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lounge_english_items TO service_role;
DROP POLICY IF EXISTS lounge_english_items_select ON public.lounge_english_items;
CREATE POLICY lounge_english_items_select ON public.lounge_english_items FOR SELECT TO authenticated USING (user_id = auth.uid());
-- A member adds only new expressions of their own; where one stands is the lesson's to say.
DROP POLICY IF EXISTS lounge_english_items_insert ON public.lounge_english_items;
CREATE POLICY lounge_english_items_insert ON public.lounge_english_items FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND source = 'mine' AND stage = 0 AND attempts = 0 AND NOT free_used AND cardinality(days) = 0 AND next_review_at IS NULL);
DROP POLICY IF EXISTS lounge_english_items_delete ON public.lounge_english_items;
CREATE POLICY lounge_english_items_delete ON public.lounge_english_items FOR DELETE TO authenticated USING (user_id = auth.uid());
-- At most 400 expressions a member.
CREATE OR REPLACE FUNCTION public.lounge_english_items_limit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF (SELECT count(*) FROM public.lounge_english_items WHERE user_id = NEW.user_id) >= 400 THEN
    RAISE EXCEPTION '단어장에는 400개까지 넣을 수 있어요. 익힌 표현을 지우고 넣어 주세요.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lounge_english_items_limit ON public.lounge_english_items;
CREATE TRIGGER lounge_english_items_limit BEFORE INSERT ON public.lounge_english_items FOR EACH ROW EXECUTE FUNCTION public.lounge_english_items_limit();

CREATE TABLE IF NOT EXISTS public.lounge_english_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.lounge_english_items(id) ON DELETE SET NULL,
  room_id text,
  character_id text,
  verdict text NOT NULL CHECK (verdict IN ('unprompted','hinted','given','missed','free','note')),
  said text NOT NULL DEFAULT '' CHECK (length(said) <= 600),
  better text NOT NULL DEFAULT '' CHECK (length(better) <= 300),
  polished text NOT NULL DEFAULT '' CHECK (length(polished) <= 300),
  why text NOT NULL DEFAULT '' CHECK (length(why) <= 400),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lounge_english_attempts_user_at ON public.lounge_english_attempts (user_id, created_at DESC);
ALTER TABLE public.lounge_english_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_english_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.lounge_english_attempts TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.lounge_english_attempts TO service_role;
DROP POLICY IF EXISTS lounge_english_attempts_select ON public.lounge_english_attempts;
CREATE POLICY lounge_english_attempts_select ON public.lounge_english_attempts FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS lounge_english_attempts_delete ON public.lounge_english_attempts;
CREATE POLICY lounge_english_attempts_delete ON public.lounge_english_attempts FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.lounge_english_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'B1' CHECK (level IN ('B1','B2')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lounge_english_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_english_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.lounge_english_profiles TO authenticated;
GRANT SELECT ON TABLE public.lounge_english_profiles TO service_role;
DROP POLICY IF EXISTS lounge_english_profiles_own ON public.lounge_english_profiles;
CREATE POLICY lounge_english_profiles_own ON public.lounge_english_profiles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lounge_scenarios WHERE id='teachertutor-lesson' AND character_id='teachertutor' AND active)
     OR NOT EXISTS (SELECT 1 FROM public.lounge_scenarios WHERE id='interpretertutor-lesson' AND character_id='interpretertutor' AND active) THEN
    RAISE EXCEPTION 'the lesson cards were not added';
  END IF;
END $$;

COMMIT;
