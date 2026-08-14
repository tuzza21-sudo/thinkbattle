-- 사람 대 사람 음성 토론의 본인 발언 모니터링용 비공개 녹음 저장소.
-- Supabase SQL Editor에서 supabase_live_debate_rooms_migration.sql 적용 후 한 번 실행하세요.

ALTER TABLE public.live_debate_arguments
  ADD COLUMN IF NOT EXISTS audio_path TEXT;

DO $$
BEGIN
  ALTER TABLE public.live_debate_arguments
    ADD CONSTRAINT live_debate_arguments_audio_path_owner_check
    CHECK (
      audio_path IS NULL
      OR audio_path LIKE user_id::TEXT || '/' || room_id || '/%'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'live-debate-audio',
  'live-debate-audio',
  FALSE,
  10485760,
  ARRAY['audio/*']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can upload own live debate audio" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own live debate audio" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own live debate audio" ON storage.objects;

CREATE POLICY "Users can upload own live debate audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'live-debate-audio'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
  AND EXISTS (
    SELECT 1
    FROM public.live_debate_room_participants participant
    JOIN public.live_debate_rooms room ON room.room_id = participant.room_id
    WHERE participant.user_id = auth.uid()
      AND participant.room_id = (storage.foldername(name))[2]
      AND room.voice_enabled
      AND room.status = 'in_progress'
  )
);

CREATE POLICY "Users can read own live debate audio"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'live-debate-audio'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
);

CREATE POLICY "Users can delete own live debate audio"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'live-debate-audio'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
);

NOTIFY pgrst, 'reload schema';
