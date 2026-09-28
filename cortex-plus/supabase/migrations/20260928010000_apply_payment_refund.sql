-- OPSİYONEL / ADDITIVE: apply_payment_refund
--
-- Uygulama kodu bu RPC yokken (42883) TypeScript yoluna düşer.
-- Uygulanmazsa: iade yine çalışır; eşzamanlılık koruması pending refunds
-- satırına dayanır (dar yarış penceresi kalır).
-- Uygulanırsa: pg_advisory_xact_lock + tek transaction'da refunds/ledger/
-- abonelik/payments güncellenir.
--
-- Silme / tip daraltma / CHECK daraltma YOK.

CREATE OR REPLACE FUNCTION public.apply_payment_refund(
  p_payment_id uuid,
  p_refund_kurus integer,
  p_provider_ref text,
  p_source text,
  p_actor_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_to_reverse integer DEFAULT 0,
  p_reversed integer DEFAULT 0,
  p_unrecovered integer DEFAULT 0,
  p_is_full boolean DEFAULT false,
  p_cancel_subscription boolean DEFAULT false,
  p_shrink_period_end timestamptz DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_pending_refund_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $BODY$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_beneficiary uuid;
  v_merchant_oid text;
  v_reason jsonb;
  v_refund_id uuid;
  v_existing_ledger integer;
  v_sub_id uuid;
  v_new_balance integer;
BEGIN
  IF p_payment_id IS NULL OR p_provider_ref IS NULL OR length(trim(p_provider_ref)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_args');
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payment_not_found');
  END IF;

  v_merchant_oid := v_payment.merchant_oid;
  PERFORM pg_advisory_xact_lock(hashtext(COALESCE(v_merchant_oid, p_payment_id::text)));

  -- Aynı ref daha önce applied mı?
  IF EXISTS (
    SELECT 1 FROM public.refunds r
     WHERE r.payment_id = p_payment_id
       AND r.reason LIKE '%"ref":"' || replace(p_provider_ref, '"', '') || '"%'
       AND r.reason LIKE '%"state":"applied"%'
  ) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'noop', true,
      'result', 'already_applied',
      'reversed', p_reversed,
      'unrecovered', p_unrecovered,
      'is_full', p_is_full
    );
  END IF;

  v_beneficiary := COALESCE(v_payment.beneficiary_user_id, v_payment.user_id);

  v_reason := jsonb_build_object(
    'state', 'applied',
    'ref', p_provider_ref,
    'source', COALESCE(NULLIF(p_source, ''), 'admin'),
    'kind', 'payment_refund',
    'merchant_oid', v_merchant_oid,
    'payment_id', p_payment_id,
    'actor_id', p_actor_id,
    'note', p_note,
    'to_reverse', COALESCE(p_to_reverse, 0),
    'reversed', COALESCE(p_reversed, 0),
    'unrecovered', COALESCE(p_unrecovered, 0),
    'is_full', COALESCE(p_is_full, false),
    'cancel_subscription', COALESCE(p_cancel_subscription, false),
    'shrink_period_end', p_shrink_period_end
  );

  IF p_pending_refund_id IS NOT NULL THEN
    UPDATE public.refunds
       SET amount_try = p_refund_kurus,
           reason = v_reason::text
     WHERE id = p_pending_refund_id
     RETURNING id INTO v_refund_id;
  END IF;

  IF v_refund_id IS NULL THEN
    INSERT INTO public.refunds (payment_id, amount_try, reason)
    VALUES (p_payment_id, p_refund_kurus, v_reason::text)
    RETURNING id INTO v_refund_id;
  END IF;

  IF COALESCE(p_reversed, 0) > 0 AND p_idempotency_key IS NOT NULL THEN
    SELECT balance_after INTO v_existing_ledger
      FROM public.credit_ledger
     WHERE user_id = v_beneficiary AND idempotency_key = p_idempotency_key
     LIMIT 1;

    IF v_existing_ledger IS NULL THEN
      BEGIN
        v_new_balance := public.credit_adjust_balance(
          v_beneficiary,
          -p_reversed,
          p_idempotency_key,
          'adjustment',
          'payment_refund:' || COALESCE(v_merchant_oid, '')
        );
      EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object(
          'ok', false,
          'partial_failure', true,
          'error_step', 'credit_adjust_balance',
          'error', SQLERRM,
          'refund_id', v_refund_id
        );
      END;
    END IF;
  END IF;

  IF COALESCE(p_is_full, false) AND COALESCE(p_cancel_subscription, false) THEN
    SELECT id INTO v_sub_id
      FROM public.subscriptions
     WHERE user_id = v_beneficiary AND status = 'active'
     ORDER BY current_period_end DESC NULLS LAST
     LIMIT 1
     FOR UPDATE;

    IF v_sub_id IS NOT NULL THEN
      UPDATE public.subscriptions
         SET status = 'cancelled', updated_at = now()
       WHERE id = v_sub_id;

      UPDATE public.credit_wallets
         SET free_allowance_remaining = 0,
             period_ends_at = now() - interval '1 second',
             updated_at = now()
       WHERE user_id = v_beneficiary;
    END IF;
  ELSIF COALESCE(p_is_full, false) AND p_shrink_period_end IS NOT NULL THEN
    SELECT id INTO v_sub_id
      FROM public.subscriptions
     WHERE user_id = v_beneficiary AND status = 'active'
     ORDER BY current_period_end DESC NULLS LAST
     LIMIT 1
     FOR UPDATE;

    IF v_sub_id IS NOT NULL THEN
      UPDATE public.subscriptions
         SET current_period_end = p_shrink_period_end, updated_at = now()
       WHERE id = v_sub_id;
    END IF;
  END IF;

  IF COALESCE(p_is_full, false) AND v_payment.status = 'paid' THEN
    UPDATE public.payments
       SET status = 'refunded', updated_at = now()
     WHERE id = p_payment_id AND status = 'paid';
  END IF;

  INSERT INTO public.notifications (user_id, title, body)
  VALUES (
    v_beneficiary,
    CASE
      WHEN COALESCE(p_cancel_subscription, false) THEN 'Üyeliğin iade nedeniyle sonlandı'
      ELSE 'Ödemen iade edildi'
    END,
    CASE
      WHEN COALESCE(p_cancel_subscription, false) THEN
        'Ödemen iade edildi. Plus üyeliğin iade nedeniyle sonlandı.'
      WHEN COALESCE(p_reversed, 0) > 0 THEN
        'Ödemen iade edildi. Hesabından ' || p_reversed || ' kredi geri alındı.'
      ELSE
        'Ödemen iade edildi.'
    END
  );

  RETURN jsonb_build_object(
    'ok', true,
    'refund_id', v_refund_id,
    'reversed', COALESCE(p_reversed, 0),
    'unrecovered', COALESCE(p_unrecovered, 0),
    'to_reverse', COALESCE(p_to_reverse, 0),
    'is_full', COALESCE(p_is_full, false),
    'cancel_subscription', COALESCE(p_cancel_subscription, false),
    'shrink_period_end', p_shrink_period_end,
    'message', 'İade işlendi.'
  );
END;
$BODY$;

REVOKE ALL ON FUNCTION public.apply_payment_refund(
  uuid, integer, text, text, uuid, text, integer, integer, integer, boolean, boolean, timestamptz, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_refund(
  uuid, integer, text, text, uuid, text, integer, integer, integer, boolean, boolean, timestamptz, text, uuid
) TO service_role;
