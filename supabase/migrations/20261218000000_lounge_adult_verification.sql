-- Apply in the Supabase SQL editor (migrations are not applied on merge).
-- (2026-11-13) Adult mode on the store app: a member confirms they are 18+, once, and the row unlocks adult mode.
-- Web does not need this table (adult mode is on by default there). Vercel LOUNGE_ADULT_MODE_USERS is no longer required.
-- method='self' is the in-app attestation; method='pass' is reserved for a later real ID check.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lounge_adult_verification (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL DEFAULT 'self' CHECK (method IN ('self', 'pass')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lounge_adult_verification ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_adult_verification FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lounge_adult_verification TO service_role;

-- A signed-in member (not a guest) confirms once. A second call returns the existing time.
CREATE OR REPLACE FUNCTION public.confirm_lounge_adult(p_method text DEFAULT 'self')
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  anon boolean;
  method text := coalesce(nullif(btrim(p_method), ''), 'self');
  verified timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT coalesce(is_anonymous, false) INTO anon FROM auth.users WHERE id = auth.uid();
  IF anon THEN RAISE EXCEPTION '게스트는 성인 인증을 할 수 없어요. 로그인 후 다시 시도해 주세요.'; END IF;
  IF method NOT IN ('self', 'pass') THEN RAISE EXCEPTION '올바르지 않은 요청이에요.'; END IF;
  INSERT INTO public.lounge_adult_verification(user_id, method)
  VALUES (auth.uid(), method)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT verified_at INTO verified FROM public.lounge_adult_verification WHERE user_id = auth.uid();
  RETURN verified;
END $$;
REVOKE ALL ON FUNCTION public.confirm_lounge_adult(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_lounge_adult(text) TO authenticated;

-- Whether this member already confirmed (null = not yet). For the app settings UI.
CREATE OR REPLACE FUNCTION public.lounge_adult_status()
RETURNS timestamptz
LANGUAGE sql SECURITY DEFINER SET search_path=public STABLE AS $$
  SELECT verified_at FROM public.lounge_adult_verification WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.lounge_adult_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lounge_adult_status() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
