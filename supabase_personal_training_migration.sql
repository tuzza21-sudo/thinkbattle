-- ThinkFit personal training profiles and user-created simulation missions.
-- Run once in the Supabase SQL Editor. Safe to run again.

CREATE TABLE IF NOT EXISTS public.training_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_text TEXT NOT NULL DEFAULT '',
  consent_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.custom_simulation_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('profile', 'custom')),
  mission_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS custom_simulation_missions_user_created_idx
  ON public.custom_simulation_missions (user_id, created_at DESC);

ALTER TABLE public.training_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_simulation_missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own training profile" ON public.training_profiles;
CREATE POLICY "Users manage own training profile"
ON public.training_profiles FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own custom simulations" ON public.custom_simulation_missions;
CREATE POLICY "Users manage own custom simulations"
ON public.custom_simulation_missions FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.training_profiles FROM anon;
REVOKE ALL ON public.custom_simulation_missions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_simulation_missions TO authenticated;
