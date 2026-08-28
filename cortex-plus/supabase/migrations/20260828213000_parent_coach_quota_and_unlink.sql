-- Veli Destek AI kotası (Plus şart değil) + onaylı bağlantıyı koparınca yeniden bağlanabilme.

ALTER TABLE public.credit_wallets
  ADD COLUMN IF NOT EXISTS parent_coach_remaining integer;

UPDATE public.credit_wallets
SET parent_coach_remaining = 40
WHERE parent_coach_remaining IS NULL;

ALTER TABLE public.credit_wallets
  ALTER COLUMN parent_coach_remaining SET DEFAULT 40,
  ALTER COLUMN parent_coach_remaining SET NOT NULL;

ALTER TABLE public.credit_wallets
  DROP CONSTRAINT IF EXISTS credit_wallets_parent_coach_remaining_check;
ALTER TABLE public.credit_wallets
  ADD CONSTRAINT credit_wallets_parent_coach_remaining_check
    CHECK (parent_coach_remaining >= 0);

INSERT INTO public.credit_rules (action_code, credit_cost, model_tier, description, active)
VALUES ('AI_CHAT_PARENT', 0, 'standard', 'Veli Destek AI (ayrı ücretsiz kota)', true)
ON CONFLICT (action_code) DO UPDATE
SET description = EXCLUDED.description, active = true;

DROP INDEX IF EXISTS public.parent_student_links_pair_key;
CREATE UNIQUE INDEX parent_student_links_pair_key
  ON public.parent_student_links (parent_id, student_id)
  WHERE student_id IS NOT NULL AND status IN ('pending', 'active');

CREATE OR REPLACE FUNCTION public.parent_coach_spend(
  p_user_id uuid,
  p_idempotency_key text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
  ) THEN
    SELECT parent_coach_remaining INTO v_remaining
    FROM public.credit_wallets WHERE user_id = p_user_id;
    RETURN COALESCE(v_remaining, 0);
  END IF;

  SELECT parent_coach_remaining INTO v_remaining
  FROM public.credit_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_remaining IS NULL THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;
  IF v_remaining < 1 THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  UPDATE public.credit_wallets
  SET parent_coach_remaining = parent_coach_remaining - 1, updated_at = now()
  WHERE user_id = p_user_id
  RETURNING parent_coach_remaining INTO v_remaining;

  INSERT INTO public.credit_ledger (
    user_id, delta, balance_after, entry_type, action_code, idempotency_key, metadata
  )
  SELECT
    p_user_id,
    -1,
    w.balance,
    'reserve',
    'AI_CHAT_PARENT',
    p_idempotency_key,
    jsonb_build_object('parent_coach', true)
  FROM public.credit_wallets w WHERE w.user_id = p_user_id;

  RETURN v_remaining;
END;
$$;

CREATE OR REPLACE FUNCTION public.parent_coach_refund(
  p_user_id uuid,
  p_idempotency_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE user_id = p_user_id
      AND idempotency_key = p_idempotency_key || ':refund'
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE user_id = p_user_id
      AND idempotency_key = p_idempotency_key
      AND action_code = 'AI_CHAT_PARENT'
  ) THEN
    RETURN;
  END IF;

  UPDATE public.credit_wallets
  SET parent_coach_remaining = parent_coach_remaining + 1, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_ledger (
    user_id, delta, balance_after, entry_type, action_code, idempotency_key, metadata
  )
  SELECT
    p_user_id,
    1,
    w.balance,
    'refund',
    'AI_CHAT_PARENT',
    p_idempotency_key || ':refund',
    jsonb_build_object('parent_coach', true)
  FROM public.credit_wallets w WHERE w.user_id = p_user_id;
END;
$$;
