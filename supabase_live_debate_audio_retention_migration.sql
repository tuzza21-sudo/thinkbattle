-- 사람 대 사람 음성 녹음의 보관기간·용량 정리 지원.
-- supabase_live_debate_audio_migration.sql 적용 후 실행하세요.

ALTER TABLE public.live_debate_arguments
  ADD COLUMN IF NOT EXISTS audio_deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS audio_delete_reason TEXT;

CREATE OR REPLACE FUNCTION public.get_live_debate_audio_cleanup_candidates(
  p_budget_bytes BIGINT DEFAULT 734003200,
  p_high_watermark NUMERIC DEFAULT 0.80,
  p_target_watermark NUMERIC DEFAULT 0.65,
  p_retention_days INTEGER DEFAULT 90,
  p_protected_count INTEGER DEFAULT 20,
  p_limit INTEGER DEFAULT 500
)
RETURNS TABLE (
  path TEXT,
  argument_id UUID,
  user_id UUID,
  room_id TEXT,
  size_bytes BIGINT,
  reason TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
STABLE
AS $$
  WITH total_usage AS (
    SELECT COALESCE(SUM(
      CASE
        WHEN object.metadata->>'size' ~ '^[0-9]+$'
          THEN (object.metadata->>'size')::BIGINT
        ELSE 0
      END
    ), 0)::BIGINT AS total_bytes
    FROM storage.objects object
    WHERE object.bucket_id = 'live-debate-audio'
  ),
  ranked AS (
    SELECT
      argument.audio_path AS path,
      argument.id AS argument_id,
      argument.user_id,
      argument.room_id,
      argument.created_at,
      CASE
        WHEN object.metadata->>'size' ~ '^[0-9]+$'
          THEN (object.metadata->>'size')::BIGINT
        ELSE 0
      END AS size_bytes,
      ROW_NUMBER() OVER (
        PARTITION BY argument.user_id
        ORDER BY argument.created_at DESC, argument.id DESC
      ) AS user_recency_rank
    FROM public.live_debate_arguments argument
    JOIN public.live_debate_rooms room ON room.room_id = argument.room_id
    JOIN storage.objects object
      ON object.bucket_id = 'live-debate-audio'
      AND object.name = argument.audio_path
    WHERE argument.audio_path IS NOT NULL
      AND room.status = 'closed'
  ),
  eligible AS (
    SELECT ranked.*
    FROM ranked
    CROSS JOIN total_usage
    WHERE ranked.user_recency_rank > GREATEST(p_protected_count, 0)
      OR (
        total_usage.total_bytes >= (GREATEST(p_budget_bytes, 1) * 0.95)::BIGINT
        AND ranked.user_recency_rank > 3
      )
  ),
  ordered AS (
    SELECT
      eligible.*,
      COALESCE(SUM(eligible.size_bytes) OVER (
        ORDER BY eligible.created_at ASC, eligible.argument_id ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0)::BIGINT AS prior_candidate_bytes
    FROM eligible
  )
  SELECT
    ordered.path,
    ordered.argument_id,
    ordered.user_id,
    ordered.room_id,
    ordered.size_bytes,
    CASE
      WHEN ordered.created_at < timezone('utc', now()) - make_interval(days => GREATEST(p_retention_days, 1))
        THEN 'retention'
      ELSE 'capacity'
    END AS reason
  FROM ordered
  CROSS JOIN total_usage
  WHERE
    ordered.created_at < timezone('utc', now()) - make_interval(days => GREATEST(p_retention_days, 1))
    OR (
      total_usage.total_bytes >= (GREATEST(p_budget_bytes, 1) * LEAST(GREATEST(p_high_watermark, 0.01), 1))::BIGINT
      AND ordered.prior_candidate_bytes < GREATEST(
        total_usage.total_bytes - (GREATEST(p_budget_bytes, 1) * LEAST(GREATEST(p_target_watermark, 0.01), 1))::BIGINT,
        0
      )
    )
  ORDER BY ordered.created_at ASC, ordered.argument_id ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 1000);
$$;

CREATE OR REPLACE FUNCTION public.mark_live_debate_audio_deleted(
  p_paths TEXT[],
  p_reason TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.live_debate_arguments
  SET audio_path = NULL,
      audio_deleted_at = timezone('utc', now()),
      audio_delete_reason = CASE
        WHEN p_reason IN ('retention', 'capacity') THEN p_reason
        ELSE 'cleanup'
      END
  WHERE audio_path = ANY(COALESCE(p_paths, ARRAY[]::TEXT[]));

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  UPDATE public.debate_records saved_record
  SET arguments = (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN item.value->>'audioPath' = ANY(COALESCE(p_paths, ARRAY[]::TEXT[])) THEN
          (item.value - 'audioPath') || jsonb_build_object(
            'audioDeletedAt', timezone('utc', now()),
            'audioDeleteReason', CASE
              WHEN p_reason IN ('retention', 'capacity') THEN p_reason
              ELSE 'cleanup'
            END
          )
        ELSE item.value
      END
      ORDER BY item.ordinality
    ), '[]'::JSONB)
    FROM jsonb_array_elements(COALESCE(saved_record.arguments, '[]'::JSONB))
      WITH ORDINALITY AS item(value, ordinality)
  )
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(saved_record.arguments, '[]'::JSONB)) AS saved_argument(value)
    WHERE saved_argument.value->>'audioPath' = ANY(COALESCE(p_paths, ARRAY[]::TEXT[]))
  );

  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.get_live_debate_audio_cleanup_candidates(BIGINT, NUMERIC, NUMERIC, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_live_debate_audio_deleted(TEXT[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_debate_audio_cleanup_candidates(BIGINT, NUMERIC, NUMERIC, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_live_debate_audio_deleted(TEXT[], TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
