-- Run in the Supabase SQL editor. Published arguments are anonymous and opt-in only.
CREATE TABLE IF NOT EXISTS public.argument_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL UNIQUE REFERENCES public.debate_records(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL,
  topic TEXT NOT NULL,
  position TEXT NOT NULL CHECK (position IN ('affirmative', 'negative')),
  claim TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence TEXT NOT NULL,
  anonymous_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
ALTER TABLE public.argument_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read published arguments" ON public.argument_library FOR SELECT USING (true);
CREATE POLICY "Owners can publish arguments" ON public.argument_library FOR INSERT WITH CHECK (auth.uid() = author_user_id);
CREATE POLICY "Owners can remove arguments" ON public.argument_library FOR DELETE USING (auth.uid() = author_user_id);
CREATE INDEX IF NOT EXISTS idx_argument_library_created_at ON public.argument_library(created_at DESC);
