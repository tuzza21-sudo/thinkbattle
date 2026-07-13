-- Run once in the Supabase SQL Editor before enabling public report links.
-- A report is public only when its owner explicitly creates a share_id.

ALTER TABLE public.debate_records
ADD COLUMN IF NOT EXISTS share_id UUID UNIQUE;

CREATE INDEX IF NOT EXISTS idx_debate_records_share_id
ON public.debate_records(share_id)
WHERE share_id IS NOT NULL;

-- Do not add a public SELECT policy to debate_records: it would expose every
-- shared row to arbitrary table queries. This RPC returns only the record
-- matching an unguessable share token and deliberately omits user_id/email.
CREATE OR REPLACE FUNCTION public.get_shared_debate_record(p_share_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', id,
    'share_id', share_id,
    'topic', topic,
    'time_limit', time_limit,
    'game_mode', game_mode,
    'user_position', user_position,
    'debate_level', debate_level,
    'debate_focus', debate_focus,
    'arguments', arguments,
    'final_report', final_report,
    'created_at', created_at
  )
  FROM public.debate_records
  WHERE share_id = p_share_id;
$$;

REVOKE ALL ON FUNCTION public.get_shared_debate_record(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_debate_record(UUID) TO anon, authenticated;
