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

  v_new := v_wallet.balance + p_delta;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  UPDATE public.credit_wallets
     SET balance = v_new,
         updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO public.credit_ledger (
    user_id, delta, balance_after, entry_type, idempotency_key, metadata
  ) VALUES (
    p_user_id,
    p_delta,
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
BEGIN
  SELECT id INTO v_existing FROM public.credit_reservations
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT credit_cost INTO v_cost FROM public.credit_rules
    WHERE action_code = p_action_code AND active = true;
  IF v_cost IS NULL THEN RAISE EXCEPTION 'invalid_action'; END IF;

  v_cost := v_cost * LEAST(GREATEST(COALESCE(p_quantity, 1), 1), 1000);

  SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_user_id FOR UPDATE;

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
      v_verified := true;
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

  IF v_wallet.balance - v_wallet.reserved < v_cost
     AND v_wallet.free_allowance_remaining < v_cost THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  v_from_free := LEAST(v_wallet.free_allowance_remaining, v_cost);

  UPDATE public.credit_wallets
    SET reserved = reserved + v_cost,
        free_allowance_remaining = GREATEST(0, free_allowance_remaining - v_from_free),
        balance = balance - GREATEST(0, v_cost - v_from_free),
        updated_at = now()
    WHERE user_id = p_user_id;

  INSERT INTO public.credit_reservations (user_id, action_code, amount, free_spent, idempotency_key)
    VALUES (p_user_id, p_action_code, v_cost, v_from_free, p_idempotency_key)
    RETURNING id INTO v_res_id;

  INSERT INTO public.credit_ledger (user_id, delta, balance_after, entry_type, action_code, idempotency_key, reference_id)
    SELECT p_user_id, -v_cost, w.balance, 'reserve', p_action_code, p_idempotency_key, v_res_id
    FROM public.credit_wallets w WHERE w.user_id = p_user_id;

  RETURN v_res_id;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.credit_reserve(uuid, text, text, integer) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.credit_reserve(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_reserve(uuid, text, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.credit_refund(p_reservation_id uuid)
RETURNS void AS $BODY$
DECLARE
  r public.credit_reservations%ROWTYPE;
  v_paid integer;
BEGIN
  SELECT * INTO r FROM public.credit_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR r.status != 'pending' THEN RETURN; END IF;

  UPDATE public.credit_reservations SET status = 'refunded' WHERE id = p_reservation_id;

  v_paid := GREATEST(0, r.amount - COALESCE(r.free_spent, 0));

  UPDATE public.credit_wallets SET
    balance = balance + v_paid,
    free_allowance_remaining = free_allowance_remaining + COALESCE(r.free_spent, 0),
    reserved = GREATEST(0, reserved - r.amount),
    updated_at = now()
  WHERE user_id = r.user_id;

  INSERT INTO public.credit_ledger (user_id, delta, balance_after, entry_type, action_code, reference_id, metadata)
  SELECT r.user_id, r.amount, w.balance, 'refund', r.action_code, r.id,
         jsonb_build_object(
           'free_restored', COALESCE(r.free_spent, 0),
           'paid_restored', v_paid
         )
  FROM public.credit_wallets w WHERE w.user_id = r.user_id;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.credit_refund(uuid) SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 3) Retrieval: sayfa numarası + chunk id (citation için)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.match_document_chunks(uuid, vector, integer, double precision, uuid);

CREATE OR REPLACE FUNCTION public.match_document_chunks(
  p_user_id uuid,
  p_query_embedding vector(1536),
  p_match_count integer DEFAULT 5,
  p_min_similarity double precision DEFAULT 0,
  p_document_id uuid DEFAULT NULL
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  file_name text,
  content text,
  similarity double precision,
  page_number integer,
  chunk_index integer
) AS $BODY$
  SELECT
    dc.id,
    dc.document_id,
    d.file_name,
    dc.content,
    1 - (de.embedding <=> p_query_embedding) AS similarity,
    dp.page_number,
    dc.chunk_index
  FROM public.document_embeddings de
  JOIN public.document_chunks dc ON dc.id = de.chunk_id
  JOIN public.documents d ON d.id = dc.document_id
  LEFT JOIN public.document_pages dp ON dp.id = dc.page_id
  WHERE d.user_id = p_user_id
    AND d.deleted_at IS NULL
    AND (p_document_id IS NULL OR d.id = p_document_id)
    AND (1 - (de.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY de.embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(p_match_count, 20));
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.match_document_chunks(uuid, vector, integer, double precision, uuid)
  SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.match_document_chunks(uuid, vector, integer, double precision, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(uuid, vector, integer, double precision, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Yazılı sınav süresi — sunucu kanonik deadline
-- ---------------------------------------------------------------------------
ALTER TABLE public.exam_prep_node_attempts
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.exam_prep_node_attempts.expires_at IS
  'Yazılı sınav süresi; client timer bunu kaynak alır. Refresh süresi sıfırlamaz.';

-- ---------------------------------------------------------------------------
-- 5) Soft-delete RPC — sahiplik kontrolü + deleted_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_document(
  p_user_id uuid,
  p_document_id uuid
)
RETURNS boolean AS $BODY$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.documents
     SET deleted_at = now(),
         updated_at = now()
   WHERE id = p_document_id
     AND user_id = p_user_id
     AND deleted_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.soft_delete_document(uuid, uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.soft_delete_document(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_document(uuid, uuid) TO service_role;
