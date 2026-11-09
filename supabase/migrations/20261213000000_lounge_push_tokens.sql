-- Apply in the Supabase SQL editor (migrations are not applied on merge).
-- (2026-11-09) Push notifications for the Android app: the phone's Firebase (FCM) token, kept per member.
-- A token belongs to one member at a time: signing in on the same phone with another account moves it. A member keeps
-- at most 10 tokens (the newest). Written through register_push_token / unregister_push_token; read only by the server
-- (api/push.ts, service role). Deleting an account deletes its tokens.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lounge_push_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_test_at timestamptz
);
CREATE INDEX IF NOT EXISTS lounge_push_tokens_user_idx ON public.lounge_push_tokens (user_id, updated_at DESC);
ALTER TABLE public.lounge_push_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_push_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lounge_push_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text DEFAULT 'android')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF p_token IS NULL OR length(p_token) < 20 OR length(p_token) > 4096 THEN RAISE EXCEPTION '알림 등록 정보가 올바르지 않아요.'; END IF;
  INSERT INTO public.lounge_push_tokens (token, user_id, platform) VALUES (p_token, auth.uid(), CASE WHEN p_platform = 'ios' THEN 'ios' ELSE 'android' END)
  ON CONFLICT (token) DO UPDATE SET user_id = auth.uid(), updated_at = now();
  DELETE FROM public.lounge_push_tokens WHERE user_id = auth.uid() AND token NOT IN (
    SELECT token FROM public.lounge_push_tokens WHERE user_id = auth.uid() ORDER BY updated_at DESC LIMIT 10);
END $$;

CREATE OR REPLACE FUNCTION public.unregister_push_token(p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  DELETE FROM public.lounge_push_tokens WHERE token = p_token AND user_id = auth.uid();
END $$;

REVOKE ALL ON FUNCTION public.register_push_token(text, text), public.unregister_push_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text), public.unregister_push_token(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
