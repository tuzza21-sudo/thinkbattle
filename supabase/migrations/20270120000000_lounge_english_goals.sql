-- 영어 수업 목표 (2026-11-26, by the owner): at a session's start the member picks the level aimed at (B1 초급 = from A2,
-- B2 중급 = from B1, C1 상급 = from B2), what they learn for and the topics they want to talk about; the tutors build the
-- lesson's situations on them. Apply by hand in the Supabase SQL editor (after 20270116000000).
BEGIN;

ALTER TABLE public.lounge_english_profiles DROP CONSTRAINT IF EXISTS lounge_english_profiles_level_check;
ALTER TABLE public.lounge_english_profiles ADD CONSTRAINT lounge_english_profiles_level_check CHECK (level IN ('A2','B1','B2'));
ALTER TABLE public.lounge_english_profiles ADD COLUMN IF NOT EXISTS purpose text CHECK (purpose IS NULL OR length(purpose) <= 200);
ALTER TABLE public.lounge_english_profiles ADD COLUMN IF NOT EXISTS topics text[] NOT NULL DEFAULT '{}' CHECK (cardinality(topics) <= 8);

COMMIT;
