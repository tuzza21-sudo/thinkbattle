-- Apply in the Supabase SQL editor (migrations are not applied on merge), after 20270116000000_lounge_english_lesson.sql.
--
-- 영어 수업 (2026-11-25, by the owner): the member puts in their own word files and the situations they are in.
--   - lounge_english_items.situation: where an expression is used (a file's third column, or the moment written for the
--     member's situation); the tutor sets the drill in it
--   - lounge_english_items.example: an example sentence for the member's situation, said when the expression is given
--   - source 'situation': expressions written for a situation the member told (the server writes them)
BEGIN;

ALTER TABLE public.lounge_english_items ADD COLUMN IF NOT EXISTS situation text CHECK (situation IS NULL OR length(situation) <= 300);
ALTER TABLE public.lounge_english_items ADD COLUMN IF NOT EXISTS example text CHECK (example IS NULL OR length(example) <= 300);

ALTER TABLE public.lounge_english_items DROP CONSTRAINT IF EXISTS lounge_english_items_source_check;
ALTER TABLE public.lounge_english_items ADD CONSTRAINT lounge_english_items_source_check CHECK (source IN ('mine','tutor','upgrade','situation'));

-- A member still adds only their own new expressions ('mine'), with a situation if their file has one, and no example.
DROP POLICY IF EXISTS lounge_english_items_insert ON public.lounge_english_items;
CREATE POLICY lounge_english_items_insert ON public.lounge_english_items FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND source = 'mine' AND stage = 0 AND attempts = 0 AND NOT free_used AND cardinality(days) = 0 AND next_review_at IS NULL AND example IS NULL);

COMMIT;
