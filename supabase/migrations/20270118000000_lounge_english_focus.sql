-- 영어 수업 학습 보드 (2026-11-26, by the owner): the member marks the expressions to learn first (focus), and each
-- expression carries how important it is (1 알아 두면 좋음 · 2 자주 씀 · 3 꼭 필요) and how hard (its CEFR level), filled in
-- by the server (action lesson-enrich) with a situation where it is used when there is none.
-- Apply by hand in the Supabase SQL editor (after 20270116000000 and 20270117000000).
BEGIN;

ALTER TABLE public.lounge_english_items ADD COLUMN IF NOT EXISTS focus boolean NOT NULL DEFAULT false;
ALTER TABLE public.lounge_english_items ADD COLUMN IF NOT EXISTS importance smallint CHECK (importance IS NULL OR importance BETWEEN 1 AND 3);
ALTER TABLE public.lounge_english_items ADD COLUMN IF NOT EXISTS difficulty text CHECK (difficulty IS NULL OR difficulty IN ('A2','B1','B2','C1','C2'));

-- The member may change only the mark on their own expressions; stages and the rest stay the server's.
GRANT UPDATE (focus) ON TABLE public.lounge_english_items TO authenticated;
DROP POLICY IF EXISTS lounge_english_items_update ON public.lounge_english_items;
CREATE POLICY lounge_english_items_update ON public.lounge_english_items FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMIT;
