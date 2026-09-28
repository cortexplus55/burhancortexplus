-- OPSİYONEL / ADDITIVE: apply_payment_refund
--
-- Uygulama kodu bu RPC yokken (42883 / PGRST202) TypeScript yoluna düşer.
-- Uygulanmazsa: iade yine çalışır; eşzamanlılık koruması pending refunds
-- satırına dayanır (dar yarış penceresi kalır).
-- Uygulanırsa: pg_advisory_xact_lock + tek transaction'da plan yeniden
-- hesaplanır, ledger/abonelik/payments güncellenir, refunds.applied EN SONDA.
--
-- Silme / tip daraltma / CHECK daraltma YOK.
-- Sürüm 20260928030000 — 20260928010000_lesson_generation_failures ile çakışmaz.

CREATE OR REPLACE FUNCTION public.apply_payment_refund(
  p_payment_id uuid,
  p_refund_kurus integer,
  p_provider_ref text,
  p_source text,
  p_actor_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_pending_refund_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $BODY$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_wallet public.credit_wallets%ROWTYPE;
  v_beneficiary uuid;
  v_merchant_oid text;
  v_purchased integer := 0;
  v_already_refunded integer := 0;
  v_already_reversed integer := 0;
  v_refund_kurus integer;
  v_is_full boolean := false;
  v_is_subscription boolean := false;
  v_touch_subscription boolean := true;
  v_to_reverse integer := 0;
  v_reversed integer := 0;
  v_unrecovered integer := 0;
  v_period_days integer := 30;
  v_cancel_sub boolean := false;
  v_shrink_end timestamptz := NULL;
  v_new_end timestamptz;
  v_sub_id uuid;
  v_sub_end timestamptz;
  v_reason jsonb;
  v_refund_id uuid;
  v_existing_ledger integer;
  v_idempotency_key text;
  v_plan_name text;
BEGIN
  IF p_payment_id IS NULL OR p_provider_ref IS NULL OR length(trim(p_provider_ref)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_args');
  END IF;
  IF p_refund_kurus IS NULL OR p_refund_kurus <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payment_not_found');
  END IF;

  v_merchant_oid := v_payment.merchant_oid;
  PERFORM pg_advisory_xact_lock(hashtext(COALESCE(v_merchant_oid, p_payment_id::text)));

  -- jsonb operatörleri (LIKE '"ref":"' ASLA — jsonb::text boşluklu render eder)
  IF EXISTS (
    SELECT 1 FROM public.refunds r
     WHERE r.payment_id = p_payment_id
       AND r.reason LIKE '{%'
       AND (r.reason::jsonb->>'kind') = 'payment_refund'
       AND (r.reason::jsonb->>'ref') = p_provider_ref
       AND (r.reason::jsonb->>'state') = 'applied'
  ) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'noop', true,
      'result', 'already_applied'
    );
  END IF;

  v_beneficiary := COALESCE(v_payment.beneficiary_user_id, v_payment.user_id);

  IF v_payment.plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.plans WHERE id = v_payment.plan_id;
  END IF;

  v_is_subscription := COALESCE(v_plan.is_premium, false)
    OR lower(COALESCE(v_plan.tier, '')) IN ('plus', 'sigma');
  v_period_days := COALESCE(NULLIF(to_jsonb(v_plan)->>'period_days', '')::integer, 30);
  v_plan_name := COALESCE(v_plan.name, 'Üyelik');

  SELECT COALESCE(delta, 0) INTO v_purchased
    FROM public.credit_ledger
   WHERE user_id = v_beneficiary
     AND idempotency_key = 'pay_' || v_merchant_oid
     AND entry_type = 'purchase'
   LIMIT 1;
  v_purchased := COALESCE(v_purchased, 0);

  -- Yalnızca applied satırları topla (kilidin altında)
  SELECT
    COALESCE(SUM(r.amount_try), 0),
    COALESCE(SUM(GREATEST(COALESCE((r.reason::jsonb->>'reversed')::integer, 0), 0)), 0)
    INTO v_already_refunded, v_already_reversed
  FROM public.refunds r
  WHERE r.payment_id = p_payment_id
    AND (
      (r.reason LIKE '{%' AND (r.reason::jsonb->>'state') = 'applied')
      OR (r.reason IS NULL OR r.reason NOT LIKE '{%')
    );

  -- B5: eski refunded + refunds yok → aboneliğe dokunma
  IF v_payment.status = 'refunded' AND v_already_refunded = 0 THEN
    v_touch_subscription := false;
  END IF;

  v_refund_kurus := LEAST(p_refund_kurus, GREATEST(v_payment.amount_try - v_already_refunded, 0));
  IF v_refund_kurus <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nothing_to_refund');
  END IF;

  v_is_full := (v_already_refunded + v_refund_kurus) >= v_payment.amount_try;
  v_to_reverse := CASE
    WHEN v_payment.amount_try > 0 THEN
      LEAST(
        floor((v_purchased::numeric * v_refund_kurus) / v_payment.amount_try)::integer,
        GREATEST(v_purchased - v_already_reversed, 0)
      )
    ELSE 0
  END;

  SELECT * INTO v_wallet
    FROM public.credit_wallets
   WHERE user_id = v_beneficiary
   FOR UPDATE;

  v_reversed := LEAST(v_to_reverse, GREATEST(COALESCE(v_wallet.balance, 0), 0));
  v_unrecovered := v_to_reverse - v_reversed;

  IF v_is_subscription AND v_is_full AND v_touch_subscription THEN
    SELECT id, current_period_end INTO v_sub_id, v_sub_end
      FROM public.subscriptions
     WHERE user_id = v_beneficiary AND status = 'active'
     ORDER BY current_period_end DESC NULLS LAST
     LIMIT 1
     FOR UPDATE;

    IF v_sub_id IS NOT NULL THEN
      v_new_end := COALESCE(v_sub_end, now()) - make_interval(days => v_period_days);
      IF v_new_end <= now() THEN
        v_cancel_sub := true;
      ELSE
        v_shrink_end := v_new_end;
      END IF;
    END IF;
  END IF;

  IF v_is_full AND v_already_refunded = 0 THEN
    v_idempotency_key := 'payment_refund:' || v_merchant_oid || ':full';
  ELSE
    v_idempotency_key := 'payment_refund:' || v_merchant_oid || ':' || p_provider_ref;
  END IF;

  -- applying satırı (henüz applied değil — hata olursa transaction rollback)
  v_reason := jsonb_build_object(
    'state', 'applying',
    'ref', p_provider_ref,
    'source', COALESCE(NULLIF(p_source, ''), 'admin'),
    'kind', 'payment_refund',
    'merchant_oid', v_merchant_oid,
    'payment_id', p_payment_id,
    'actor_id', p_actor_id,
    'note', p_note,
    'to_reverse', v_to_reverse,
    'reversed', v_reversed,
    'unrecovered', v_unrecovered,
    'is_full', v_is_full,
    'cancel_subscription', v_cancel_sub,
    'shrink_period_end', v_shrink_end,
    'skip_subscription', NOT v_touch_subscription
  );

  IF p_pending_refund_id IS NOT NULL THEN
    UPDATE public.refunds
       SET amount_try = v_refund_kurus,
           reason = v_reason::text
     WHERE id = p_pending_refund_id
     RETURNING id INTO v_refund_id;
  END IF;

  IF v_refund_id IS NULL THEN
    -- Aynı ref applying ise onu kullan
    SELECT id INTO v_refund_id
      FROM public.refunds r
     WHERE r.payment_id = p_payment_id
       AND r.reason LIKE '{%'
       AND (r.reason::jsonb->>'ref') = p_provider_ref
       AND (r.reason::jsonb->>'state') IN ('pending', 'applying')
     ORDER BY created_at ASC
     LIMIT 1;

    IF v_refund_id IS NOT NULL THEN
      UPDATE public.refunds
         SET amount_try = v_refund_kurus, reason = v_reason::text
       WHERE id = v_refund_id;
    ELSE
      INSERT INTO public.refunds (payment_id, amount_try, reason)
      VALUES (p_payment_id, v_refund_kurus, v_reason::text)
      RETURNING id INTO v_refund_id;
    END IF;
  END IF;

  IF v_reversed > 0 THEN
    SELECT balance_after INTO v_existing_ledger
      FROM public.credit_ledger
     WHERE user_id = v_beneficiary AND idempotency_key = v_idempotency_key
     LIMIT 1;

    IF v_existing_ledger IS NULL THEN
      -- Hata yutulmaz: tüm transaction (refunds satırı dahil) geri alınır (B1).
      PERFORM public.credit_adjust_balance(
        v_beneficiary,
        -v_reversed,
        v_idempotency_key,
        'adjustment',
        'payment_refund:' || COALESCE(v_merchant_oid, '')
      );
    ELSE
      v_reversed := abs((
        SELECT delta FROM public.credit_ledger
         WHERE user_id = v_beneficiary AND idempotency_key = v_idempotency_key
         LIMIT 1
      ));
      v_unrecovered := GREATEST(v_to_reverse - v_reversed, 0);
    END IF;
  END IF;

  IF v_cancel_sub AND v_sub_id IS NOT NULL THEN
    UPDATE public.subscriptions
       SET status = 'cancelled', updated_at = now()
     WHERE id = v_sub_id AND status = 'active';

    UPDATE public.credit_wallets
       SET free_allowance_remaining = 0,
           period_ends_at = now() - interval '1 second',
           updated_at = now()
     WHERE user_id = v_beneficiary;
  ELSIF v_shrink_end IS NOT NULL AND v_sub_id IS NOT NULL THEN
    UPDATE public.subscriptions
       SET current_period_end = v_shrink_end, updated_at = now()
     WHERE id = v_sub_id AND status = 'active';
  END IF;

  IF v_is_full AND v_payment.status = 'paid' THEN
    UPDATE public.payments
       SET status = 'refunded', updated_at = now()
     WHERE id = p_payment_id AND status = 'paid';
  END IF;

  -- applied EN SONDA
  v_reason := v_reason || jsonb_build_object(
    'state', 'applied',
    'reversed', v_reversed,
    'unrecovered', v_unrecovered
  );
  UPDATE public.refunds
     SET reason = v_reason::text, amount_try = v_refund_kurus
   WHERE id = v_refund_id;

  INSERT INTO public.notifications (user_id, title, body)
  VALUES (
    v_beneficiary,
    CASE
      WHEN v_cancel_sub THEN 'Üyeliğin iade nedeniyle sonlandı'
      ELSE 'Ödemen iade edildi'
    END,
    CASE
      WHEN v_cancel_sub THEN
        'Ödemen iade edildi. ' || v_plan_name || ' üyeliğin iade nedeniyle sonlandı.'
      WHEN v_reversed > 0 THEN
        'Ödemen iade edildi. Hesabından ' || v_reversed || ' kredi geri alındı.'
      ELSE
        'Ödemen iade edildi.'
    END
  );

  RETURN jsonb_build_object(
    'ok', true,
    'refund_id', v_refund_id,
    'reversed', v_reversed,
    'unrecovered', v_unrecovered,
    'to_reverse', v_to_reverse,
    'is_full', v_is_full,
    'cancel_subscription', v_cancel_sub,
    'shrink_period_end', v_shrink_end,
    'message', 'İade işlendi.'
  );
END;
$BODY$;

REVOKE ALL ON FUNCTION public.apply_payment_refund(
  uuid, integer, text, text, uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_refund(
  uuid, integer, text, text, uuid, text, uuid
) TO service_role;
