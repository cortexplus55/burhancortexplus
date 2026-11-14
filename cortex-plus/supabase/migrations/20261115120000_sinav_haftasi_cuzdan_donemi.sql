-- Sınav Haftası (ve aylık Plus) cüzdan dönemi boşluğu — docs/design-migration/bilinen-sunucu-sapmalari.md #2.
-- Burhan 15 Kasım 2026'da onayladı; aynı gün SQL ekranında canlıya uygulandı (kayıt satırıyla).
--
-- Bugün: ödemede abonelik `ödeme anı + period_days`, cüzdan `UTC gün başı + 7 / 30 gün` biter
-- (20260923180000). Cüzdan aboneliğin bitişinden en çok 24 saat önce biter; aradaki saatlerde abonelik etkin
-- olduğu için credit_reserve 7 / 30 günlük YENİ bir hak yazar (20261024123000) ve dönemi aboneliğin ötesine
-- taşır. Abonelik bitince öğrenci ücretsizdir ama bu hak sayaçsız işlerde (ör. belge sayfası) harcanır.
--
-- Değişen (yalnız aynı imzayla yeniden tanımlama; tablo, sütun ve veri değişmez):
--   1. finalize_paytr_payment: cüzdan dönemi ödeme anından sayılır, aboneliğin bitişini geçmez.
--   2. credit_reserve: yenilenen dönem aboneliğin bitişini geçmez; aboneliğin son 24 saatinde yeni dönem hakkı
--      yazılmaz (eski ödemeler ve uzatılmış paketlerde kalan kuyruk için). Gövdenin geri kalanı 20261024123000 ile
--      aynı.
-- Uygulama: SQL ekranında tek çalıştırma + kayıt satırı:
--   insert into supabase_migrations.schema_migrations (version, name)
--     values ('20261115120000', 'sinav_haftasi_cuzdan_donemi') on conflict (version) do nothing;
-- Geri alma: 20260923180000 ve 20261024123000'deki iki fonksiyon gövdesi yeniden çalıştırılır.

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
  v_from_free integer;
  v_previous public.credit_reservations%ROWTYPE;
  v_attempt integer := 1;
  v_ledger_key text;
  v_preview public.admin_free_preview%ROWTYPE;
  v_preview_on boolean := false;
  v_sub_end timestamptz;
  v_tail boolean := false;
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
    SELECT * INTO v_preview FROM public.admin_free_preview WHERE user_id = p_user_id FOR UPDATE;
    v_preview_on := FOUND;
    IF v_preview_on THEN
      IF now() >= v_preview.period_ends_at THEN
        -- Önizleme ücretsiz hesabı taklit eder: günlük kredi 0 (sayaçlı işler credit_reserve_metered'de).
        v_preview.remaining := 0;
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
    SELECT COALESCE(pl.monthly_allowance, 7200), pl.billing_period, s.current_period_end
      INTO v_plan_allowance, v_plan_period, v_sub_end
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
      -- Dönem aboneliğin bitişini geçmez: abonelik bitince kalan hak ücretsiz hesapta harcanmasın.
      IF v_sub_end IS NOT NULL THEN
        v_ends := LEAST(v_ends, v_sub_end);
        -- Aboneliğin son 24 saati: gün başına yuvarlamanın bıraktığı kuyruk (eski ödemelerde cüzdan aboneliğin
        -- bitişinden en çok 24 saat önce biter). Yeni dönem hakkı yazılmaz; eldeki hak abonelik bitene kadar geçerli.
        v_tail := v_sub_end - now() < interval '1 day';
      END IF;
    ELSIF NOT COALESCE(v_verified, true) THEN
      v_allowance := public.unverified_allowance();
      v_kind := 'daily';
      v_ends := date_trunc('day', now()) + interval '1 day';
    ELSE
      -- 24 Ekim 2026: ücretsiz hak sayıya dayalı (free_usage); günlük kredi yok.
      v_allowance := 0;
      v_kind := 'daily';
      v_ends := date_trunc('day', now()) + interval '1 day';
    END IF;

    IF v_tail THEN
      UPDATE public.credit_wallets
        SET free_allowance_remaining = LEAST(free_allowance_remaining, v_allowance),
            period_allowance = v_allowance,
            period_kind = v_kind,
            period_ends_at = v_ends,
            updated_at = now()
        WHERE user_id = p_user_id;
    ELSE
      UPDATE public.credit_wallets
        SET free_allowance_remaining = v_allowance,
            period_allowance = v_allowance,
            period_kind = v_kind,
            period_ends_at = v_ends,
            updated_at = now()
        WHERE user_id = p_user_id;
    END IF;

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

CREATE OR REPLACE FUNCTION public.finalize_paytr_payment(p_merchant_oid text, p_payload_hash text, p_status text, p_raw_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    OR lower(COALESCE(v_plan.tier, '')) IN ('plus', 'sigma');
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
           period_kind = CASE WHEN v_billing_period = 'weekly'
                              THEN 'weekly' ELSE 'monthly' END,
           -- Dönem ödeme anından sayılır ve aboneliğin bitişini geçmez (Sınav Haftası'nda ikisi aynı an).
           period_ends_at = LEAST(
             now() + make_interval(days => CASE WHEN v_billing_period = 'weekly'
                                                THEN 7 ELSE 30 END),
             v_period_end
           ),
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
$function$;

-- Yetkiler açıkça yeniden yazılıyor. `CREATE OR REPLACE` var olan hakları
-- koruyor, ama bu satırlar bir kez sessizce düşürülmüştü ve fonksiyon
-- herkese açık kalmıştı; açıkça yazmak o hatayı imkânsız kılıyor.
REVOKE ALL ON FUNCTION public.finalize_paytr_payment(text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paytr_payment(text, text, text, jsonb)
  TO service_role;
