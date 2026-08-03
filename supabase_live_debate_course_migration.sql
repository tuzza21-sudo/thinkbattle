-- Live debate course, topic context, and text-only realtime transport.
-- Run once in the Supabase SQL Editor for an existing ThinkBattle project.

ALTER TABLE public.live_debate_rooms
  ADD COLUMN IF NOT EXISTS topic_description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.live_debate_rooms
  ADD COLUMN IF NOT EXISTS debate_level TEXT NOT NULL DEFAULT 'beginner';
ALTER TABLE public.live_debate_rooms
  ADD COLUMN IF NOT EXISTS voice_enabled BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  ALTER TABLE public.live_debate_rooms
    ADD CONSTRAINT live_debate_rooms_debate_level_check
    CHECK (debate_level IN ('beginner', 'intermediate'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.live_debate_arguments (
  id UUID PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES public.live_debate_rooms(room_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  sender_name TEXT NOT NULL DEFAULT '토론 참가자',
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1200),
  source TEXT NOT NULL DEFAULT 'text' CHECK (source IN ('text', 'voice')),
  phase_id TEXT,
  phase_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_live_debate_arguments_room_time
  ON public.live_debate_arguments(room_id, created_at);

ALTER TABLE public.live_debate_arguments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.live_debate_arguments TO authenticated;

DROP POLICY IF EXISTS "Room participants can read live debate arguments" ON public.live_debate_arguments;
DROP POLICY IF EXISTS "Room participants can create live debate arguments" ON public.live_debate_arguments;

CREATE POLICY "Room participants can read live debate arguments"
ON public.live_debate_arguments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.live_debate_room_participants participant
    WHERE participant.room_id = live_debate_arguments.room_id
      AND participant.user_id = auth.uid()
  )
);

CREATE POLICY "Room participants can create live debate arguments"
ON public.live_debate_arguments FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.live_debate_room_participants participant
    JOIN public.live_debate_rooms room ON room.room_id = participant.room_id
    WHERE participant.room_id = live_debate_arguments.room_id
      AND participant.user_id = auth.uid()
      AND room.status = 'in_progress'
  )
);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_debate_arguments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
