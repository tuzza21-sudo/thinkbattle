-- Apply in the Supabase SQL editor (migrations are not applied on merge). Apply it BEFORE members can choose "10대 (18세 이상)":
-- until then, saving that choice fails with "invalid age group".
-- (2026-11-17) Sign-up offers 10s (18 and over) and no longer offers 60s ("50대 이상" takes its place). Members who chose 60s before keep it.
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_age_group_check' AND pg_get_constraintdef(oid) LIKE '%10s%') THEN
    RAISE EXCEPTION 'users_age_group_check was not updated';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
