-- Apply in the Supabase SQL editor (migrations are not applied on merge).
-- (2026-11-09) A character reaching out first (api/lounge-reach-out.ts): what the server keeps per member, and the
-- member's own switch. A member who never touched the switch has it on (their notifications being on is the consent);
-- last_sent_at is what keeps it to one a day. Deleting an account deletes the row.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lounge_reach_out (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  last_character text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lounge_reach_out ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_reach_out FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lounge_reach_out TO service_role;

CREATE OR REPLACE FUNCTION public.get_reach_out() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  RETURN coalesce((SELECT enabled FROM public.lounge_reach_out WHERE user_id = auth.uid()), true);
END $$;

CREATE OR REPLACE FUNCTION public.set_reach_out(p_enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  INSERT INTO public.lounge_reach_out (user_id, enabled) VALUES (auth.uid(), coalesce(p_enabled, true))
  ON CONFLICT (user_id) DO UPDATE SET enabled = coalesce(p_enabled, true), updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.get_reach_out(), public.set_reach_out(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_reach_out(), public.set_reach_out(boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
