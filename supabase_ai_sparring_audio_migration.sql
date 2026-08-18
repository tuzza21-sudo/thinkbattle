-- AI 스파링의 본인 음성 발언을 비공개로 저장하고, 사람 간 음성 토론과
-- 합산해 사용자별 최근 20개 녹음만 유지한다.
-- supabase_live_debate_audio_migration.sql 및
-- supabase_live_debate_audio_retention_migration.sql 적용 후 실행한다.

CREATE TABLE IF NOT EXISTS public.ai_sparring_audio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  argument_id TEXT NOT NULL,
  audio_path TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  audio_deleted_at TIMESTAMPTZ,
  audio_delete_reason TEXT,
  CONSTRAINT ai_sparring_audio_user_argument_unique UNIQUE (user_id, argument_id),
  CONSTRAINT ai_sparring_audio_path_owner_check CHECK (
    audio_path LIKE user_id::TEXT || '/ai-sparring/%'
  ),
  CONSTRAINT ai_sparring_audio_delete_reason_check CHECK (
    audio_delete_reason IS NULL
    OR audio_delete_reason IN ('retention', 'capacity', 'limit', 'cleanup')
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_sparring_audio_user_created
  ON public.ai_sparring_audio (user_id, created_at DESC);

ALTER TABLE public.ai_sparring_audio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own AI sparring audio metadata" ON public.ai_sparring_audio;
DROP POLICY IF EXISTS "Users can register own AI sparring audio" ON public.ai_sparring_audio;
DROP POLICY IF EXISTS "Users can delete own AI sparring audio metadata" ON public.ai_sparring_audio;

CREATE POLICY "Users can read own AI sparring audio metadata"
ON public.ai_sparring_audio FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can register own AI sparring audio"
ON public.ai_sparring_audio FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own AI sparring audio metadata"
ON public.ai_sparring_audio FOR DELETE TO authenticated
USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.ai_sparring_audio TO authenticated;

-- AI 스파링 경로는 먼저 등록된 본인 메타데이터가 있어야 업로드할 수 있다.
DROP POLICY IF EXISTS "Users can upload own live debate audio" ON storage.objects;

CREATE POLICY "Users can upload own live debate audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'live-debate-audio'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
  AND (
    (
      (storage.foldername(name))[2] = 'ai-sparring'
      AND EXISTS (
        SELECT 1
        FROM public.ai_sparring_audio sparring
        WHERE sparring.user_id = auth.uid()
          AND sparring.audio_path = name
          AND sparring.audio_deleted_at IS NULL
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.live_debate_room_participants participant
      JOIN public.live_debate_rooms room ON room.room_id = participant.room_id
      WHERE participant.user_id = auth.uid()
        AND participant.room_id = (storage.foldername(name))[2]
        AND room.voice_enabled
        AND room.status = 'in_progress'
    )
  )
);

-- 반환 형식에 AI 스파링의 문자열 argument_id를 포함하기 위해 기존 함수를 재생성한다.
DROP FUNCTION IF EXISTS public.get_live_debate_audio_cleanup_candidates(BIGINT, NUMERIC, NUMERIC, INTEGER, INTEGER, INTEGER);

CREATE FUNCTION public.get_live_debate_audio_cleanup_candidates(
  p_budget_bytes BIGINT DEFAULT 734003200,
  p_high_watermark NUMERIC DEFAULT 0.80,
  p_target_watermark NUMERIC DEFAULT 0.65,
  p_retention_days INTEGER DEFAULT 90,
  p_protected_count INTEGER DEFAULT 20,
  p_limit INTEGER DEFAULT 500
)
RETURNS TABLE (
  path TEXT,
  argument_id TEXT,
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
  all_audio AS (
    SELECT
      argument.audio_path AS path,
      argument.id::TEXT AS argument_id,
      argument.user_id,
      argument.room_id,
      argument.created_at,
      CASE
        WHEN object.metadata->>'size' ~ '^[0-9]+$'
          THEN (object.metadata->>'size')::BIGINT
        ELSE 0
      END AS size_bytes
    FROM public.live_debate_arguments argument
    JOIN public.live_debate_rooms room ON room.room_id = argument.room_id
    JOIN storage.objects object
      ON object.bucket_id = 'live-debate-audio'
      AND object.name = argument.audio_path
    WHERE argument.audio_path IS NOT NULL
      AND room.status = 'closed'

    UNION ALL

    SELECT
      sparring.audio_path AS path,
      sparring.argument_id,
      sparring.user_id,
      NULL::TEXT AS room_id,
      sparring.created_at,
      CASE
        WHEN object.metadata->>'size' ~ '^[0-9]+$'
          THEN (object.metadata->>'size')::BIGINT
        ELSE 0
      END AS size_bytes
    FROM public.ai_sparring_audio sparring
    JOIN storage.objects object
      ON object.bucket_id = 'live-debate-audio'
      AND object.name = sparring.audio_path
    WHERE sparring.audio_deleted_at IS NULL
  ),
  ranked AS (
    SELECT
      all_audio.*,
      ROW_NUMBER() OVER (
        PARTITION BY all_audio.user_id
        ORDER BY all_audio.created_at DESC, all_audio.argument_id DESC
      ) AS user_recency_rank
    FROM all_audio
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
      WHEN ordered.user_recency_rank > GREATEST(p_protected_count, 0) THEN 'limit'
      WHEN ordered.created_at < timezone('utc', now()) - make_interval(days => GREATEST(p_retention_days, 1)) THEN 'retention'
      ELSE 'capacity'
    END AS reason
  FROM ordered
  CROSS JOIN total_usage
  WHERE
    ordered.user_recency_rank > GREATEST(p_protected_count, 0)
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
  live_updated_count INTEGER := 0;
  sparring_updated_count INTEGER := 0;
  normalized_reason TEXT := CASE
    WHEN p_reason IN ('retention', 'capacity', 'limit') THEN p_reason
    ELSE 'cleanup'
  END;
BEGIN
  UPDATE public.live_debate_arguments
  SET audio_path = NULL,
      audio_deleted_at = timezone('utc', now()),
      audio_delete_reason = normalized_reason
  WHERE audio_path = ANY(COALESCE(p_paths, ARRAY[]::TEXT[]));

  GET DIAGNOSTICS live_updated_count = ROW_COUNT;

  UPDATE public.ai_sparring_audio
  SET audio_deleted_at = timezone('utc', now()),
      audio_delete_reason = normalized_reason
  WHERE audio_path = ANY(COALESCE(p_paths, ARRAY[]::TEXT[]))
    AND audio_deleted_at IS NULL;

  GET DIAGNOSTICS sparring_updated_count = ROW_COUNT;

  UPDATE public.debate_records saved_record
  SET arguments = (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN item.value->>'audioPath' = ANY(COALESCE(p_paths, ARRAY[]::TEXT[])) THEN
          (item.value - 'audioPath') || jsonb_build_object(
            'audioDeletedAt', timezone('utc', now()),
            'audioDeleteReason', normalized_reason
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

  RETURN live_updated_count + sparring_updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.get_live_debate_audio_cleanup_candidates(BIGINT, NUMERIC, NUMERIC, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_live_debate_audio_deleted(TEXT[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_debate_audio_cleanup_candidates(BIGINT, NUMERIC, NUMERIC, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_live_debate_audio_deleted(TEXT[], TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
