-- PayTR callback settlement in one transaction. The preceding subscription
-- migration adds the billing-period and monthly-allowance columns used here.

CREATE OR REPLACE FUNCTION public.finalize_paytr_payment(
  p_merchant_oid text,
  p_payload_hash text,
  p_status text,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $BODY$
DECLARE
  v_event public.payment_webhook_events%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_wallet public.credit_wallets%ROWTYPE;
  v_beneficiary uuid;
  v_credit integer := 0;
  v_is_subscription boolean := false;
  v_period_days integer := 30;
  v_monthly_allowance integer := 400;
  v_billing_period text := 'monthly';
  v_period_end timestamptz;
  v_subscription_id uuid;
  v_balance integer;
BEGIN
  -- PayTR says duplicate detection is based on merchant_oid. The transaction
  -- lock also serializes two callbacks whose payload hashes differ.
  PERFORM pg_advisory_xact_lock(hashtext(p_merchant_oid));

  IF EXISTS (
    SELECT 1 FROM public.payment_webhook_events
     WHERE merchant_oid = p_merchant_oid AND processed_at IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('result', 'already_processed');
  END IF;

  INSERT INTO public.payment_webhook_events (
    merchant_oid, payload_hash, status, raw_payload, processed_at
  )
  VALUES (p_merchant_oid, p_payload_hash, p_status, p_raw_payload, NULL)
  ON CONFLICT (payload_hash) DO NOTHING;

  SELECT * INTO v_event
    FROM public.payment_webhook_events
   WHERE payload_hash = p_payload_hash
   FOR UPDATE;

  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'webhook_event_missing';
  END IF;
  IF v_event.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('result', 'already_processed');
  END IF;

  SELECT * INTO v_payment
    FROM public.payments
   WHERE merchant_oid = p_merchant_oid
   FOR UPDATE;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'payment_not_found';
  END IF;

  IF p_status <> 'success' THEN
    UPDATE public.payments
       SET status = 'failed', updated_at = now()
     WHERE id = v_payment.id AND status <> 'paid';
    UPDATE public.payment_webhook_events
       SET processed_at = now()
     WHERE id = v_event.id;
    RETURN jsonb_build_object('result', 'failed', 'payment_id', v_payment.id);
  END IF;

  IF v_payment.status = 'paid' THEN
    UPDATE public.payment_webhook_events
       SET processed_at = now()
     WHERE id = v_event.id;
    RETURN jsonb_build_object('result', 'already_paid', 'payment_id', v_payment.id);
  END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = v_payment.plan_id;
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'plan_not_found';
  END IF;

  v_beneficiary := COALESCE(v_payment.beneficiary_user_id, v_payment.user_id);
  v_credit := GREATEST(COALESCE(v_plan.credit_amount, 0), 0);
  v_is_subscription := COALESCE(v_plan.is_premium, false)
    OR lower(COALESCE(v_plan.name, '')) LIKE ANY (ARRAY['%plus%', '%sigma%', '%premium%']);
  v_period_days := COALESCE(NULLIF(to_jsonb(v_plan)->>'period_days', '')::integer, 30);
  v_monthly_allowance := COALESCE(
    NULLIF(to_jsonb(v_plan)->>'monthly_allowance', '')::integer,
    400
  );
  v_billing_period := COALESCE(
    NULLIF(to_jsonb(v_plan)->>'billing_period', ''),
    'monthly'
  );

  IF v_credit > 0 AND NOT EXISTS (
    SELECT 1 FROM public.credit_ledger
     WHERE user_id = v_beneficiary AND idempotency_key = 'pay_' || p_merchant_oid
  ) THEN
    INSERT INTO public.credit_wallets (user_id, balance, reserved)
    VALUES (v_beneficiary, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO v_wallet
      FROM public.credit_wallets
     WHERE user_id = v_beneficiary
     FOR UPDATE;

    v_balance := v_wallet.balance + v_credit;
    UPDATE public.credit_wallets
       SET balance = v_balance, updated_at = now()
     WHERE user_id = v_beneficiary;

    INSERT INTO public.credit_ledger (
      user_id, delta, balance_after, entry_type, idempotency_key,
      reference_id, metadata
    ) VALUES (
      v_beneficiary, v_credit, v_balance, 'purchase',
      'pay_' || p_merchant_oid, v_payment.id,
      jsonb_build_object(
        'merchant_oid', p_merchant_oid,
        'paid_by', v_payment.user_id,
        'beneficiary', v_beneficiary
      )
    );
  END IF;

  IF v_is_subscription THEN
    SELECT id INTO v_subscription_id
      FROM public.subscriptions
     WHERE user_id = v_beneficiary AND status = 'active'
     ORDER BY current_period_end DESC NULLS LAST, updated_at DESC
     LIMIT 1
     FOR UPDATE;

    IF v_subscription_id IS NOT NULL THEN
      UPDATE public.subscriptions
         SET plan_id = v_payment.plan_id,
             current_period_end = GREATEST(COALESCE(current_period_end, now()), now())
               + make_interval(days => v_period_days),
             current_period_start = COALESCE(current_period_start, now()),
             billing_period = v_billing_period,
             cancel_at_period_end = false,
             renewal_reminder_sent_at = NULL,
             expired_notified_at = NULL,
             updated_at = now()
       WHERE id = v_subscription_id
       RETURNING current_period_end INTO v_period_end;
    ELSE
      SELECT id INTO v_subscription_id
        FROM public.subscriptions
       WHERE user_id = v_beneficiary
       ORDER BY updated_at DESC
       LIMIT 1
       FOR UPDATE;

      v_period_end := now() + make_interval(days => v_period_days);
      IF v_subscription_id IS NOT NULL THEN
        UPDATE public.subscriptions
           SET plan_id = v_payment.plan_id,
               status = 'active',
               current_period_start = now(),
               current_period_end = v_period_end,
               billing_period = v_billing_period,
               cancel_at_period_end = false,
               renewal_reminder_sent_at = NULL,
               expired_notified_at = NULL,
               updated_at = now()
         WHERE id = v_subscription_id;
      ELSE
        INSERT INTO public.subscriptions (
          user_id, plan_id, status, current_period_start, current_period_end,
          billing_period, cancel_at_period_end
        ) VALUES (
          v_beneficiary, v_payment.plan_id, 'active', now(), v_period_end,
          v_billing_period, false
        );
      END IF;
    END IF;

    -- Ücretli dönem açıldığı anda kademenin ilk aylık hakkını tanımla.
    -- Yıllık üyelik 365 gün sürer; kullanım hakkı yine her 30 günde yenilenir.
    INSERT INTO public.credit_wallets (user_id, balance, reserved)
    VALUES (v_beneficiary, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO v_wallet
      FROM public.credit_wallets
     WHERE user_id = v_beneficiary
     FOR UPDATE;

    UPDATE public.credit_wallets
       SET free_allowance_remaining = GREATEST(
             free_allowance_remaining,
             v_monthly_allowance
           ),
           period_allowance = v_monthly_allowance,
           period_kind = 'monthly',
           period_ends_at = date_trunc('day', now()) + interval '30 days',
           updated_at = now()
     WHERE user_id = v_beneficiary;
  END IF;

  UPDATE public.payments
     SET status = 'paid', updated_at = now()
   WHERE id = v_payment.id;

  IF v_beneficiary = v_payment.user_id THEN
    INSERT INTO public.notifications (user_id, title, body)
    VALUES (
      v_payment.user_id,
      CASE WHEN v_is_subscription THEN v_plan.name || ' aboneliğin açıldı'
           ELSE 'Kredi yüklendi' END,
      CASE WHEN v_is_subscription THEN v_plan.name || ' hesabına tanımlandı.'
           ELSE v_plan.name || ' için ' || v_credit || ' kredi hesabına tanımlandı.' END
    );
  ELSE
    INSERT INTO public.notifications (user_id, title, body)
    VALUES
      (v_beneficiary,
       CASE WHEN v_is_subscription THEN 'Aboneliğin açıldı' ELSE 'Kredi yüklendi' END,
       v_plan.name || ' velin tarafından hesabına tanımlandı.'),
      (v_payment.user_id, 'Ödeme tamamlandı',
       v_plan.name || ' öğrencinin hesabına tanımlandı.');

    UPDATE public.parent_payment_requests
       SET status = 'paid', resolved_at = now()
     WHERE student_id = v_beneficiary AND status = 'pending';
  END IF;

  UPDATE public.payment_webhook_events
     SET processed_at = now()
   WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'result', 'completed',
    'payment_id', v_payment.id,
    'payer_id', v_payment.user_id,
    'beneficiary_id', v_beneficiary,
    'credits', v_credit,
    'period_end', v_period_end
  );
END;
$BODY$;

REVOKE ALL ON FUNCTION public.finalize_paytr_payment(text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paytr_payment(text, text, text, jsonb)
  TO service_role;
