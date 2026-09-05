-- Move the former featured semiconductor issue into the Economy detail category.
-- This is idempotent and restores the row if it was previously soft-deleted.

UPDATE public.homepage_debate_topics
SET topic_kind = 'detail',
    sector = '경제',
    issue_label = '',
    is_active = TRUE,
    deleted_at = NULL,
    updated_at = timezone('utc', now())
WHERE lower(trim(title)) = lower('반도체 기업의 초과이익은 노동자와 사회에 공유되어야 하는가?');

NOTIFY pgrst, 'reload schema';
