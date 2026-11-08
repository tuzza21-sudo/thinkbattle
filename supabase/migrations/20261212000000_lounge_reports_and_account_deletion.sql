-- Apply in the Supabase SQL editor (migrations are not applied on merge).
-- (2026-11-08) What the app stores require: reporting an AI reply, and deleting the account from inside the app.
--
-- 1. lounge_message_reports: a member reports a character's reply (reason + a few words); the reply's text is copied so a
--    review does not depend on the room still existing. Written only through report_lounge_message().
-- 2. Deleting an account (api/account.ts calls the Auth admin API):
--    * lounge_payments keeps its rows without the account (user_id becomes NULL): the e-commerce act requires keeping
--      the record of an order and its payment for 5 years. Nothing but the order itself stays (no name, no e-mail).
--    * every other foreign key to auth.users that would stop the deletion (NO ACTION) becomes CASCADE, or SET NULL when
--      the column may be empty, so the member's own data goes with the account.
--    * lounge_deleted_accounts: one anonymous row per deletion (when, and whether a paid plan was running); the account
--      API also uses its presence as the sign that this migration has been applied.
BEGIN;

-- ---- 1. Reports of a reply ----
CREATE TABLE IF NOT EXISTS public.lounge_message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message_id bigint NOT NULL,
  room_id text,
  character_id text,
  reason text NOT NULL CHECK (reason IN ('sexual', 'violence', 'hate', 'false_info', 'other')),
  detail text NOT NULL DEFAULT '' CHECK (length(detail) <= 500),
  message_text text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lounge_message_reports_once ON public.lounge_message_reports (reporter, message_id) WHERE reporter IS NOT NULL;
CREATE INDEX IF NOT EXISTS lounge_message_reports_open ON public.lounge_message_reports (created_at DESC) WHERE status = 'open';
ALTER TABLE public.lounge_message_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_message_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lounge_message_reports TO service_role;

-- A member reports a character's reply in a one-to-one room of their own; 20 reports a day at most; the same reply once.
CREATE OR REPLACE FUNCTION public.report_lounge_message(p_message_id bigint, p_reason text, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.voice_lounge_messages; r public.voice_lounge_rooms;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  IF p_reason NOT IN ('sexual', 'violence', 'hate', 'false_info', 'other') THEN RAISE EXCEPTION '신고 사유를 골라 주세요.'; END IF;
  SELECT * INTO m FROM public.voice_lounge_messages WHERE id = p_message_id AND kind = 'host';
  IF NOT FOUND THEN RAISE EXCEPTION '신고할 수 없는 메시지예요.'; END IF;
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id = m.room_id AND host_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION '신고할 수 없는 메시지예요.'; END IF;
  IF (SELECT count(*) FROM public.lounge_message_reports WHERE reporter = auth.uid() AND created_at > now() - interval '1 day') >= 20 THEN
    RAISE EXCEPTION '오늘은 더 신고할 수 없어요. 내일 다시 시도해 주세요.';
  END IF;
  INSERT INTO public.lounge_message_reports (reporter, message_id, room_id, character_id, reason, detail, message_text)
  VALUES (auth.uid(), m.id, m.room_id, r.host_persona, p_reason, left(coalesce(p_detail, ''), 500), m.text)
  ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.report_lounge_message(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_lounge_message(bigint, text, text) TO authenticated;

-- ---- 2. Deleting an account ----
CREATE TABLE IF NOT EXISTS public.lounge_deleted_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_at timestamptz NOT NULL DEFAULT now(),
  had_paid_plan boolean NOT NULL DEFAULT false
);
ALTER TABLE public.lounge_deleted_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_deleted_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.lounge_deleted_accounts TO service_role;

-- Orders stay without the account.
ALTER TABLE public.lounge_payments ALTER COLUMN user_id DROP NOT NULL;
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.lounge_payments'::regclass AND contype = 'f' AND confrelid = 'auth.users'::regclass LOOP
    EXECUTE format('ALTER TABLE public.lounge_payments DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.lounge_payments ADD CONSTRAINT lounge_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Every other foreign key to auth.users that would refuse the deletion (NO ACTION / RESTRICT).
DO $$
DECLARE c record; act text;
BEGIN
  FOR c IN
    SELECT k.oid, k.conname, k.conrelid::regclass AS tbl, k.conkey[1] AS col, pg_get_constraintdef(k.oid) AS def, a.attnotnull
    FROM pg_constraint k
    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
    WHERE k.contype = 'f' AND k.confrelid = 'auth.users'::regclass AND k.confdeltype IN ('a', 'r')
      AND array_length(k.conkey, 1) = 1 AND k.connamespace = 'public'::regnamespace
  LOOP
    act := CASE WHEN c.attnotnull THEN 'CASCADE' ELSE 'SET NULL' END;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I, ADD CONSTRAINT %I %s ON DELETE %s', c.tbl, c.conname, c.conname, c.def, act);
    RAISE NOTICE 'auth.users foreign key % on % now ON DELETE %', c.conname, c.tbl, act;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
