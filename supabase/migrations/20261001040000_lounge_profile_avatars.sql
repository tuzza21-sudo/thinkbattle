BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS lounge_avatar_path text;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_lounge_avatar_path_check;
ALTER TABLE public.users ADD CONSTRAINT users_lounge_avatar_path_check CHECK (
  lounge_avatar_path IS NULL OR (
    lounge_avatar_path LIKE id::text || '/%'
    AND lounge_avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
  )
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lounge-avatars', 'lounge-avatars', false, 1048576, ARRAY['image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS lounge_avatar_read_own ON storage.objects;
CREATE POLICY lounge_avatar_read_own ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'lounge-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS lounge_avatar_insert_own ON storage.objects;
CREATE POLICY lounge_avatar_insert_own ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'lounge-avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean, false));
DROP POLICY IF EXISTS lounge_avatar_delete_own ON storage.objects;
CREATE POLICY lounge_avatar_delete_own ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'lounge-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Fixed limits in a separate table cannot be reset through the general AI quota RPC.
CREATE TABLE IF NOT EXISTS public.lounge_avatar_generation_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz NOT NULL
);
ALTER TABLE public.lounge_avatar_generation_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lounge_avatar_generation_limits FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.consume_lounge_avatar_generation() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE used integer;
BEGIN
  IF auth.uid() IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'registered account required'; END IF;
  INSERT INTO lounge_avatar_generation_limits(user_id, day, attempts, last_attempt_at)
  VALUES (auth.uid(), (now() AT TIME ZONE 'Asia/Seoul')::date, 1, now())
  ON CONFLICT (user_id) DO UPDATE SET
    day = EXCLUDED.day,
    attempts = CASE WHEN lounge_avatar_generation_limits.day = EXCLUDED.day THEN lounge_avatar_generation_limits.attempts + 1 ELSE 1 END,
    last_attempt_at = now()
  WHERE (lounge_avatar_generation_limits.day <> EXCLUDED.day OR lounge_avatar_generation_limits.attempts < 3)
    AND lounge_avatar_generation_limits.last_attempt_at <= now() - interval '15 seconds'
  RETURNING attempts INTO used;
  RETURN used IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_lounge_avatar_generation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_lounge_avatar_generation() TO authenticated;

COMMIT;
