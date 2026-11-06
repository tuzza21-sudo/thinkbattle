-- (2026-11-06) Plan payments through KG Inicis (api/payments.ts). One row per order: created as pending when the
-- payment window opens, then marked paid (with the Inicis tid) or failed when Inicis returns. A paid row covers one
-- month from period_start; paying again while a period is running extends it. Only the service role writes here; a
-- member can read their own rows.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lounge_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('plus', 'pro')),
  amount integer NOT NULL CHECK (amount > 0),
  oid text NOT NULL UNIQUE,
  device text NOT NULL CHECK (device IN ('pc', 'mobile')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  tid text,
  pay_method text,
  result_code text,
  result_message text,
  paid_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lounge_payments_user_idx ON public.lounge_payments (user_id, created_at DESC);

ALTER TABLE public.lounge_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read own payments" ON public.lounge_payments;
CREATE POLICY "members read own payments" ON public.lounge_payments FOR SELECT USING (auth.uid() = user_id);

COMMIT;
