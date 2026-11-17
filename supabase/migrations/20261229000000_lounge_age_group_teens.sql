-- Apply in the Supabase SQL editor (migrations are not applied on merge). Apply it BEFORE members can choose "10대 (16세 이상)":
-- until then, saving that choice fails with "invalid age group".
-- (2026-11-17) Sign-up offers 10s (from 16 years old) and no longer offers 60s. Members who chose 60s before keep it.
-- A member whose age group is 10s never gets adult mode: the server checks it (api/lounge.ts) and the confirmation below refuses it.
BEGIN;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_age_group_check;
ALTER TABLE public.users ADD CONSTRAINT users_age_group_check CHECK (age_group IS NULL OR age_group IN ('10s','20s','30s','40s','50s','60s'));

-- The member's own profile fields. Age group is one of 10s..50s (60s only if it is already theirs) or empty.
CREATE OR REPLACE FUNCTION public.update_lounge_profile(p_age_group text, p_region text, p_bio text, p_show_presence boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  age text := nullif(btrim(coalesce(p_age_group, '')), '');
  place text := nullif(btrim(coalesce(p_region, '')), '');
  intro text := nullif(btrim(coalesce(p_bio, '')), '');
BEGIN
  IF NOT public.lounge_is_member() THEN RAISE EXCEPTION 'registered account required'; END IF;
  IF age IS NOT NULL AND age NOT IN ('10s','20s','30s','40s','50s')
     AND NOT (age = '60s' AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND age_group = '60s')) THEN RAISE EXCEPTION 'invalid age group'; END IF;
  IF length(coalesce(place, '')) > 30 THEN RAISE EXCEPTION 'region too long'; END IF;
  IF length(coalesce(intro, '')) > 200 THEN RAISE EXCEPTION 'introduction too long'; END IF;
  UPDATE public.users SET age_group = age, region = place, bio = intro, show_presence = coalesce(p_show_presence, show_presence) WHERE id = auth.uid();
END;
$$;

-- The app's adult confirmation is refused for a member whose age group is 10s (the rest is as in 20261218).
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
  IF EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND age_group = '10s') THEN RAISE EXCEPTION '만 18세 이상만 성인 인증을 할 수 있어요.'; END IF;
  INSERT INTO public.lounge_adult_verification(user_id, method)
  VALUES (auth.uid(), method)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT verified_at INTO verified FROM public.lounge_adult_verification WHERE user_id = auth.uid();
  RETURN verified;
END $$;
REVOKE ALL ON FUNCTION public.confirm_lounge_adult(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_lounge_adult(text) TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_age_group_check' AND pg_get_constraintdef(oid) LIKE '%10s%') THEN
    RAISE EXCEPTION 'users_age_group_check was not updated';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
