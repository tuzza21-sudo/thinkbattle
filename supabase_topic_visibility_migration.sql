-- Separate the public B2C topic library from private organization topics.
-- Run after supabase_b2b_admin_migration.sql and supabase_live_debate_rooms_migration.sql.

CREATE TABLE IF NOT EXISTS public.public_debate_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK (char_length(trim(description)) BETWEEN 1 AND 2000),
  briefing JSONB NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  language TEXT NOT NULL DEFAULT 'ko' CHECK (language IN ('ko', 'en')),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CHECK (jsonb_typeof(briefing) = 'object'),
  CHECK (jsonb_typeof(config) = 'object')
);

ALTER TABLE public.public_debate_topics
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'ko';
ALTER TABLE public.public_debate_topics
  ALTER COLUMN is_active SET DEFAULT FALSE;
ALTER TABLE public.public_debate_topics
  DROP CONSTRAINT IF EXISTS public_debate_topics_language_check;
ALTER TABLE public.public_debate_topics
  ADD CONSTRAINT public_debate_topics_language_check CHECK (language IN ('ko', 'en'));

CREATE INDEX IF NOT EXISTS idx_public_debate_topics_active
  ON public.public_debate_topics (language, is_active, created_at DESC);

ALTER TABLE public.public_debate_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can read active public debate topics" ON public.public_debate_topics;
DROP POLICY IF EXISTS "Authenticated users can create public debate topics" ON public.public_debate_topics;
DROP POLICY IF EXISTS "Creators can update public debate topics" ON public.public_debate_topics;
DROP POLICY IF EXISTS "Creators can delete public debate topics" ON public.public_debate_topics;
DROP POLICY IF EXISTS "Creators can read own submitted debate topics" ON public.public_debate_topics;

CREATE POLICY "Everyone can read active public debate topics"
ON public.public_debate_topics FOR SELECT TO anon, authenticated
USING (is_active);

CREATE POLICY "Creators can read own submitted debate topics"
ON public.public_debate_topics FOR SELECT TO authenticated
USING (created_by = auth.uid());

GRANT SELECT ON public.public_debate_topics TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.public_debate_topics FROM authenticated;

CREATE OR REPLACE FUNCTION public.submit_public_debate_topic(
  topic_title TEXT,
  topic_description TEXT,
  topic_briefing JSONB,
  topic_config JSONB,
  topic_language TEXT DEFAULT 'ko'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE created_topic public.public_debate_topics%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF char_length(trim(topic_title)) NOT BETWEEN 1 AND 120
    OR char_length(trim(topic_description)) NOT BETWEEN 1 AND 2000
    OR topic_language NOT IN ('ko', 'en')
    OR jsonb_typeof(topic_briefing) <> 'object'
    OR jsonb_typeof(topic_config) <> 'object'
    OR NOT (topic_briefing ? 'context' AND topic_briefing ? 'affirmative' AND topic_briefing ? 'negative' AND topic_briefing ? 'newsLinks')
  THEN RAISE EXCEPTION 'invalid topic submission'; END IF;
  IF (
    SELECT count(*) FROM public.public_debate_topics
    WHERE created_by = auth.uid() AND created_at >= timezone('utc', now()) - interval '1 day'
  ) >= 10 THEN RAISE EXCEPTION 'daily topic submission limit reached'; END IF;

  SELECT * INTO created_topic
  FROM public.public_debate_topics
  WHERE created_by = auth.uid()
    AND lower(trim(title)) = lower(trim(topic_title))
    AND language = topic_language
  ORDER BY created_at DESC
  LIMIT 1;
  IF created_topic.id IS NOT NULL THEN RETURN to_jsonb(created_topic); END IF;

  INSERT INTO public.public_debate_topics
    (created_by, title, description, briefing, config, language, is_active)
  VALUES
    (auth.uid(), trim(topic_title), trim(topic_description), topic_briefing, topic_config, topic_language, FALSE)
  RETURNING * INTO created_topic;
  RETURN to_jsonb(created_topic);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_debate_topic(TEXT, TEXT, JSONB, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_debate_topic(TEXT, TEXT, JSONB, JSONB, TEXT) TO authenticated;

-- Organization topics are readable only inside their own membership boundary.
DROP POLICY IF EXISTS "Organization members can read organization topics" ON public.organization_topics;
DROP POLICY IF EXISTS "Organization staff can create organization topics" ON public.organization_topics;
DROP POLICY IF EXISTS "Organization staff can update organization topics" ON public.organization_topics;
DROP POLICY IF EXISTS "Organization staff can delete organization topics" ON public.organization_topics;

CREATE POLICY "Organization members can read organization topics"
ON public.organization_topics FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_memberships membership
    WHERE membership.organization_id = organization_topics.organization_id
      AND membership.user_id = auth.uid()
  )
);

CREATE POLICY "Organization staff can create organization topics"
ON public.organization_topics FOR INSERT TO authenticated
WITH CHECK (public.is_organization_staff(organization_id));

CREATE POLICY "Organization staff can update organization topics"
ON public.organization_topics FOR UPDATE TO authenticated
USING (public.is_organization_staff(organization_id))
WITH CHECK (public.is_organization_staff(organization_id));

CREATE POLICY "Organization staff can delete organization topics"
ON public.organization_topics FOR DELETE TO authenticated
USING (public.is_organization_staff(organization_id));

GRANT SELECT ON public.organization_topics TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.organization_topics TO authenticated;

-- Preserve the complete briefing on live rooms so all authorized participants
-- see the same background, pro/con points, and article links.
ALTER TABLE public.live_debate_rooms
  ADD COLUMN IF NOT EXISTS topic_briefing JSONB,
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'ko';

ALTER TABLE public.live_debate_rooms
  DROP CONSTRAINT IF EXISTS live_debate_rooms_language_check;
ALTER TABLE public.live_debate_rooms
  ADD CONSTRAINT live_debate_rooms_language_check CHECK (language IN ('ko', 'en'));

ALTER TABLE public.live_debate_rooms
  DROP CONSTRAINT IF EXISTS live_debate_rooms_topic_briefing_check;
ALTER TABLE public.live_debate_rooms
  ADD CONSTRAINT live_debate_rooms_topic_briefing_check
  CHECK (topic_briefing IS NULL OR jsonb_typeof(topic_briefing) = 'object');

-- Make the additive columns visible to PostgREST immediately after execution.
NOTIFY pgrst, 'reload schema';
