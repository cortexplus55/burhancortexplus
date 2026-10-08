-- Yönetici "ücretsiz gibi gör" önizlemesi (8 Ekim 2026, ürün sahibinin kararı).
--
-- Kurucu hesabı yönetici: kredi düşmüyor, belge ve hazırlık sınırı yok. Bu
-- yüzden ücretsiz katman (#249) canlıda hiç denenemedi. Önizleme açıkken:
--   - cüzdana yine dokunulmaz; günlük 2 kredilik ayrı bir hak bu tabloda düşer
--     (ücretsiz katmanla aynı sayı: 20261003120000_free_tier_one_lesson);
--   - belge ve hazırlık sınırı yalnız önizleme başladıktan sonra eklenenleri
--     sayar (uygulama tarafı, `started_at`) — yeni bir ücretsiz hesap gibi.
-- Satırı yalnız yönetici açar (/admin → "Ücretsiz gibi gör",
-- free-preview-actions.ts); kapatınca silinir.

CREATE TABLE IF NOT EXISTS public.admin_free_preview (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  remaining integer NOT NULL DEFAULT 2,
  period_ends_at timestamptz NOT NULL DEFAULT (date_trunc('day', now()) + interval '1 day')
);

ALTER TABLE public.admin_free_preview ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_free_preview FROM anon, authenticated;
-- Plan çözücü (getUserEntitlements) oturum istemcisiyle de çağrılıyor:
-- kişi yalnız kendi satırını okur. Yazma yalnız sunucu anahtarıyla.
GRANT SELECT ON public.admin_free_preview TO authenticated;
DROP POLICY IF EXISTS admin_free_preview_self_read ON public.admin_free_preview;
CREATE POLICY admin_free_preview_self_read ON public.admin_free_preview
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- credit_reserve: 20261003120000 ile aynı; değişen yalnız yönetici kolu.
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
  v_ledger_key text;
  v_preview public.admin_free_preview%ROWTYPE;
  v_preview_on boolean := false;
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

  -- Yönetici: cüzdan aynı kalır, işlem deftere 0 tutarla düşer.
  IF public.is_admin(p_user_id) THEN
    -- Ücretsiz önizleme: hak bu tabloda düşer, harcanan free_spent'e yazılır
    -- ki iade aynı günün hakkını geri versin.
    SELECT * INTO v_preview FROM public.admin_free_preview WHERE user_id = p_user_id FOR UPDATE;
    v_preview_on := FOUND;
    IF v_preview_on THEN
      IF now() >= v_preview.period_ends_at THEN
        v_preview.remaining := 2;
        v_preview.period_ends_at := date_trunc('day', now()) + interval '1 day';
      END IF;
      IF v_preview.remaining < v_cost THEN RAISE EXCEPTION 'insufficient_credits'; END IF;
      UPDATE public.admin_free_preview
        SET remaining = v_preview.remaining - v_cost,
            period_ends_at = v_preview.period_ends_at
        WHERE user_id = p_user_id;
    END IF;

    IF v_previous.id IS NOT NULL THEN
      UPDATE public.credit_reservations SET
        operation_key=COALESCE(operation_key,p_idempotency_key),
        idempotency_key=p_idempotency_key || ':refunded:' || id::text
        WHERE id=v_previous.id;
    END IF;

    INSERT INTO public.credit_reservations (user_id, action_code, amount, free_spent, allowance_period_end, idempotency_key, operation_key, attempt)
      VALUES (
        p_user_id,
        p_action_code,
        0,
        CASE WHEN v_preview_on THEN v_cost ELSE 0 END,
        CASE WHEN v_preview_on THEN v_preview.period_ends_at ELSE v_wallet.period_ends_at END,
        p_idempotency_key,
        p_idempotency_key,
        v_attempt
      )
      RETURNING id INTO v_res_id;

    v_ledger_key := CASE WHEN v_attempt = 1 THEN p_idempotency_key ELSE p_idempotency_key || ':attempt:' || v_attempt END;
    INSERT INTO public.credit_ledger (user_id, delta, balance_before, balance_after, entry_type, action_code, idempotency_key, reference_id, metadata)
      VALUES (
        p_user_id,
        0,
        v_wallet.balance,
        v_wallet.balance,
        'reserve',
        p_action_code,
        v_ledger_key,
        v_res_id,
        jsonb_build_object(
          'admin_bypass', true,
          'free_preview', v_preview_on,
          'nominal_cost', v_cost,
          'action_code', p_action_code,
          'attempt', v_attempt
        )
      );

    RETURN v_res_id;
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
      v_allowance := 2;
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

-- credit_refund: 20260925180000 ile aynı; 0 tutarlı önizleme kaydı hakkı geri verir.
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
  IF r.amount = 0 THEN
    UPDATE public.credit_reservations SET status = 'refunded' WHERE id = r.id;
    -- Önizleme kaydı: aynı günün hakkı geri döner; gün geçtiyse dönmez.
    IF r.free_spent > 0 THEN
      UPDATE public.admin_free_preview
        SET remaining = remaining + r.free_spent
        WHERE user_id = r.user_id
          AND period_ends_at = r.allowance_period_end
          AND now() < period_ends_at;
    END IF;
    RETURN;
  END IF;
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

REVOKE ALL ON FUNCTION public.credit_refund(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_refund(uuid) TO service_role;
