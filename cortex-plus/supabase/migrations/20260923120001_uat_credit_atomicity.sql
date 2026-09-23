-- Applied after the future-dated 20260923120000 migration. Generated using CLI.
-- Purchased balance and allowance movements are recorded separately.
ALTER TABLE public.credit_ledger ADD COLUMN IF NOT EXISTS balance_before integer;
ALTER TABLE public.credit_reservations ADD COLUMN IF NOT EXISTS allowance_period_end timestamptz;
ALTER TABLE public.credit_reservations ADD COLUMN IF NOT EXISTS execution_token uuid;
ALTER TABLE public.credit_reservations ADD COLUMN IF NOT EXISTS operation_key text;
ALTER TABLE public.credit_reservations ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1;
ALTER TABLE public.credit_reservations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- UAT hardening: atomic admin credit adjust, free-allowance-aware refund,
-- retrieval page metadata, exam timer deadline, document soft-delete helpers.

-- ---------------------------------------------------------------------------
-- 1) Admin kredi ayarı — race'siz FOR UPDATE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_adjust_balance(
  p_user_id uuid,
  p_delta integer,
  p_idempotency_key text,
  p_entry_type text DEFAULT 'adjustment',
  p_reason text DEFAULT NULL
)
RETURNS integer AS $BODY$
DECLARE
  v_wallet public.credit_wallets%ROWTYPE;
  v_existing integer;
  v_new integer;
BEGIN
  IF p_delta = 0 THEN
    RAISE EXCEPTION 'zero_delta';
  END IF;

  SELECT balance_after INTO v_existing
    FROM public.credit_ledger
   WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_wallet
    FROM public.credit_wallets
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF v_wallet.user_id IS NULL THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;

  SELECT balance_after INTO v_existing FROM public.credit_ledger
   WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_existing; END IF;
  v_new := v_wallet.balance + p_delta;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  UPDATE public.credit_wallets
     SET balance = v_new,
         updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO public.credit_ledger (
    user_id, delta, balance_before, balance_after, entry_type, idempotency_key, metadata
  ) VALUES (
    p_user_id,
    p_delta,
    v_wallet.balance,
    v_new,
    COALESCE(NULLIF(p_entry_type, ''), 'adjustment'),
    p_idempotency_key,
    jsonb_build_object('reason', p_reason)
  );

  RETURN v_new;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.credit_adjust_balance(uuid, integer, text, text, text)
  SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.credit_adjust_balance(uuid, integer, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_adjust_balance(uuid, integer, text, text, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Rezervasyonda free vs paid ayrımı + refund free_allowance geri yükler
-- ---------------------------------------------------------------------------
ALTER TABLE public.credit_reservations
  ADD COLUMN IF NOT EXISTS free_spent integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.credit_reservations.free_spent IS
  'Rezervasyon anında free_allowance_remaining''den düşülen tutar; refund bunu geri yükler.';

-- credit_reserve: free_spent kaydet (mevcut imza korunur)
CREATE OR REPLACE FUNCTION public.credit_reserve(
  p_user_id uuid,
  p_action_code text,
  p_idempotency_key text,
  p_quantity integer DEFAULT 1
)
RETURNS uuid AS $BODY$
DECLARE
  v_cost integer;
  v_wallet public.credit_wallets%ROWTYPE;
  v_res_id uuid;
  v_existing uuid;
  v_plan_allowance integer;
  v_plan_period text;
  v_window integer;
  v_premium boolean;
  v_verified boolean;
  v_allowance integer;
  v_kind text;
  v_ends timestamptz;
  v_mult integer;
  v_from_free integer;
  v_previous public.credit_reservations%ROWTYPE;
  v_attempt integer := 1;
BEGIN

  SELECT credit_cost INTO v_cost FROM public.credit_rules
    WHERE action_code = p_action_code AND active = true;
  IF v_cost IS NULL THEN RAISE EXCEPTION 'invalid_action'; END IF;

  v_cost := v_cost * LEAST(GREATEST(COALESCE(p_quantity, 1), 1), 1000);

  SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  -- A replay may have committed while this request waited for the wallet.
  SELECT * INTO v_previous FROM public.credit_reservations
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_previous.action_code <> p_action_code THEN RAISE EXCEPTION 'operation_action_mismatch'; END IF;
    IF v_previous.status <> 'refunded' THEN RETURN v_previous.id; END IF;
    v_attempt := v_previous.attempt + 1;
  END IF;

  IF v_wallet.user_id IS NOT NULL AND now() >= v_wallet.period_ends_at THEN
    SELECT COALESCE(pl.monthly_allowance, 400), pl.billing_period
      INTO v_plan_allowance, v_plan_period
      FROM public.subscriptions s
      JOIN public.plans pl ON pl.id = s.plan_id
     WHERE s.user_id = p_user_id
       AND s.status = 'active'
       AND pl.is_premium
       AND (s.current_period_end IS NULL OR s.current_period_end > now())
     ORDER BY pl.monthly_allowance DESC NULLS LAST
     LIMIT 1;

    v_premium := v_plan_allowance IS NOT NULL;

    BEGIN
      v_verified := public.account_verified(p_user_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'verification_unavailable';
    END;

    IF v_premium THEN
      v_allowance := v_plan_allowance;
      v_window := CASE WHEN v_plan_period = 'weekly' THEN 7 ELSE 30 END;
      v_kind := CASE WHEN v_plan_period = 'weekly' THEN 'weekly' ELSE 'monthly' END;
      v_ends := date_trunc('day', now()) + (v_window || ' days')::interval;
    ELSIF NOT COALESCE(v_verified, true) THEN
      v_allowance := public.unverified_allowance();
      v_kind := 'daily';
      v_ends := date_trunc('day', now()) + interval '1 day';
    ELSE
      v_allowance := 6;
      v_kind := 'daily';
      v_ends := date_trunc('day', now()) + interval '1 day';
    END IF;

    IF v_premium OR COALESCE(v_verified, true) THEN
      BEGIN
        v_mult := public.referral_multiplier(p_user_id);
      EXCEPTION WHEN OTHERS THEN
        v_mult := 1;
      END;
      v_allowance := LEAST(
        v_allowance * GREATEST(COALESCE(v_mult, 1), 1),
        100000
      );
    END IF;

    UPDATE public.credit_wallets
      SET free_allowance_remaining = v_allowance,
          period_allowance = v_allowance,
          period_kind = v_kind,
          period_ends_at = v_ends,
          updated_at = now()
      WHERE user_id = p_user_id;

    SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  -- Both buckets are already debited at reservation time.
  IF v_wallet.balance + v_wallet.free_allowance_remaining < v_cost THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  v_from_free := LEAST(v_wallet.free_allowance_remaining, v_cost);

  UPDATE public.credit_wallets
    SET reserved = reserved + v_cost,
        free_allowance_remaining = GREATEST(0, free_allowance_remaining - v_from_free),
        balance = balance - GREATEST(0, v_cost - v_from_free),
        updated_at = now()
    WHERE user_id = p_user_id;

  IF v_previous.id IS NOT NULL THEN
    -- Keep settled attempts immutable. A delayed refund/commit for the old id
    -- must never settle the retried generation's reservation.
    UPDATE public.credit_reservations SET
      operation_key=COALESCE(operation_key,p_idempotency_key),
      idempotency_key=p_idempotency_key || ':refunded:' || id::text
      WHERE id=v_previous.id;
  END IF;
  INSERT INTO public.credit_reservations (user_id, action_code, amount, free_spent, allowance_period_end, idempotency_key,operation_key,attempt)
    VALUES (p_user_id,p_action_code,v_cost,v_from_free,v_wallet.period_ends_at,p_idempotency_key,p_idempotency_key,v_attempt)
    RETURNING id INTO v_res_id;

  INSERT INTO public.credit_ledger (user_id, delta, balance_before, balance_after, entry_type, action_code, idempotency_key, reference_id, metadata)
    SELECT p_user_id, -v_cost, v_wallet.balance, w.balance, 'reserve', p_action_code, CASE WHEN v_attempt=1 THEN p_idempotency_key ELSE p_idempotency_key || ':attempt:' || v_attempt END, v_res_id, jsonb_build_object('attempt', v_attempt, 'free_before', v_wallet.free_allowance_remaining, 'free_after', w.free_allowance_remaining, 'free_spent', v_from_free, 'paid_spent', v_cost - v_from_free)
    FROM public.credit_wallets w WHERE w.user_id = p_user_id;

  RETURN v_res_id;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.credit_reserve(uuid, text, text, integer) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.credit_reserve(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_reserve(uuid, text, text, integer) TO service_role;


CREATE OR REPLACE FUNCTION public.credit_refund(p_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.credit_reservations%ROWTYPE; w public.credit_wallets%ROWTYPE; paid integer; free integer;
BEGIN
  SELECT * INTO r FROM public.credit_reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN RETURN; END IF;
  -- All settlement paths use wallet -> reservation order.
  SELECT * INTO w FROM public.credit_wallets WHERE user_id = r.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  SELECT * INTO r FROM public.credit_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF r.status <> 'pending' THEN RETURN; END IF;
  paid := r.amount - r.free_spent;
  -- Expired allowance cannot inflate the next period or become paid credits.
  free := CASE WHEN r.allowance_period_end = w.period_ends_at AND now() < w.period_ends_at THEN r.free_spent ELSE 0 END;
  UPDATE public.credit_reservations SET status = 'refunded' WHERE id = r.id;
  UPDATE public.credit_wallets SET balance = balance + paid,
    free_allowance_remaining = free_allowance_remaining + free,
    reserved = reserved - r.amount, updated_at = now() WHERE user_id = r.user_id;
  INSERT INTO public.credit_ledger(user_id, delta, balance_before, balance_after, entry_type, action_code, reference_id, metadata)
    VALUES (r.user_id, paid + free, w.balance, w.balance + paid, 'refund', r.action_code, r.id,
      jsonb_build_object('free_restored', free, 'paid_restored', paid, 'expired_free', r.free_spent - free));
END;
$$;
CREATE OR REPLACE FUNCTION public.credit_commit(p_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.credit_reservations%ROWTYPE; w public.credit_wallets%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.credit_reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO w FROM public.credit_wallets WHERE user_id = r.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  SELECT * INTO r FROM public.credit_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF r.status <> 'pending' THEN RETURN; END IF;
  UPDATE public.credit_reservations SET status = 'committed' WHERE id = r.id;
  UPDATE public.credit_wallets SET reserved = reserved - r.amount, updated_at = now() WHERE user_id = r.user_id;
  INSERT INTO public.credit_ledger(user_id, delta, balance_before, balance_after, entry_type, action_code, reference_id)
    VALUES (r.user_id, 0, w.balance, w.balance, 'commit', r.action_code, r.id);
END;
$$;
REVOKE ALL ON FUNCTION public.credit_commit(uuid), public.credit_refund(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_commit(uuid), public.credit_refund(uuid) TO service_role;

-- Reservation idempotency and execution ownership are separate. Only the winner
-- may call a paid provider; concurrent callers must wait for the existing result.
CREATE OR REPLACE FUNCTION public.credit_claim_operation(p_reservation_id uuid, p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.credit_reservations%ROWTYPE;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'missing_execution_token'; END IF;
  SELECT * INTO r FROM public.credit_reservations WHERE id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','missing'); END IF;
  IF r.status <> 'pending' THEN RETURN jsonb_build_object('state',r.status); END IF;
  IF r.execution_token IS NOT NULL AND r.execution_token <> p_token THEN RETURN jsonb_build_object('state','busy'); END IF;
  UPDATE public.credit_reservations SET execution_token=p_token,updated_at=now() WHERE id=r.id;
  RETURN jsonb_build_object('state','claimed','amount',r.amount);
END;
$$;
REVOKE ALL ON FUNCTION public.credit_claim_operation(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.credit_claim_operation(uuid,uuid) TO service_role;
