-- Kredi sistemi v2 (8 Ekim 2026, ürün sahibinin kararı). Gerekçe ve hesap:
-- docs/delivery/KREDI-SISTEMI.md. Kısaca:
--   - 1 kredi = $0,001 model maliyeti (₺0,052, $1 = ₺52). İşlemin kredisi
--     canlıda ölçülen maliyetinden (ai_usage_events, 3 Ekim sonrası).
--   - Plus ayda 7.200 (Astra Plus ≈ 2.000 mesaj / 220–380 ders; bizde 2.400
--     mesaj / 1.200 ders), haftalık 2.700, Sigma 60.000, ücretsiz günde 6
--     (bir ders ya da iki mesaj). Yıllıklar aylıkla aynı hak.
--   - Kâr hedefi yoğun öğrenciye göre %50 (KDV %20 ve PayTR %2,95 düşülünce).
--   - Belge sayfası tek sayaçtan: metinli 2, taranmış +6.
--   - Eski bakiyeler sıfırlanır; herkes yeni dönemle yeni haktan başlar
--     (ürün sahibinin kararı; o gün aktif abonelik yoktu).

-- İşlem bedelleri.
UPDATE public.credit_rules SET credit_cost = c.cost, updated_at = now()
  FROM (VALUES
    ('AI_CHAT_STANDARD', 3), ('AI_CHAT_ADVANCED', 3), ('IMAGE_SOLUTION', 10),
    ('DOCUMENT_PAGE_PROCESS', 2), ('QUIZ_GENERATE', 4), ('FLASHCARD_GENERATE', 3),
    ('STUDY_PLAN_GENERATE', 6), ('PRACTICE_EXAM_GENERATE', 15), ('PRACTICE_EXAM_GRADE', 0),
    ('AUDIO_SYNTHESIZE', 2), ('EXPORT_PDF', 0)
  ) AS c(code, cost)
 WHERE credit_rules.action_code = c.code;

UPDATE public.credit_rules SET active = false, updated_at = now() WHERE action_code = 'LAB_APP_GENERATE';

INSERT INTO public.credit_rules (action_code, credit_cost, model_tier, description, active) VALUES
  ('PODCAST_GENERATE', 12, 'standard', 'Podcast (metin + seslendirme)', true),
  ('ORAL_EXAM_GENERATE', 8, 'standard', 'Sözlü deneme', true),
  ('VOICE_TURN', 6, 'standard', 'Sesli sohbet, tur başı (dinleme + cevap + ses)', true),
  ('DOCUMENT_SCAN_PAGE', 6, 'standard', 'Taranmış sayfa okuma (metinli sayfa bedelinin üstüne)', true)
ON CONFLICT (action_code) DO UPDATE
  SET credit_cost = EXCLUDED.credit_cost, description = EXCLUDED.description,
      active = true, updated_at = now();

-- Paket hakları (aylık hak; haftalıkta haftalık).
UPDATE public.plans SET monthly_allowance = p.allowance, updated_at = now()
  FROM (VALUES
    ('plus-haftalik', 2700), ('plus-aylik', 7200), ('plus-yillik', 7200),
    ('sigma-aylik', 60000), ('sigma-yillik', 60000)
  ) AS p(slug, allowance)
 WHERE plans.slug = p.slug;

-- Ek paketler: tam kullanımda bile %50 kâr (₺129 → 1.000, ₺329 → 2.500, ₺749 → 5.750).
UPDATE public.plans SET credit_amount = p.credits, name = p.name, updated_at = now()
  FROM (VALUES
    ('ek-kredi-50', 1000, 'Ek paket S'),
    ('ek-kredi-150', 2500, 'Ek paket M'),
    ('ek-kredi-400', 5750, 'Ek paket L')
  ) AS p(slug, credits, name)
 WHERE plans.slug = p.slug;

-- Doğrulanmamış hesap da ücretsizle aynı günlük hak (eski birimde 2 = bir mesajdı;
-- yeni birimde 2 bir mesaja bile yetmezdi).
CREATE OR REPLACE FUNCTION public.unverified_allowance()
RETURNS integer AS $BODY$ SELECT 6; $BODY$ LANGUAGE sql IMMUTABLE;

ALTER TABLE public.admin_free_preview ALTER COLUMN remaining SET DEFAULT 6;
UPDATE public.admin_free_preview SET remaining = LEAST(remaining * 3, 6);

-- credit_reserve: 20261008100000 ile aynı; değişen ücretsiz hak (6), abonelik
-- yedek hakkı (7.200) ve önizleme hakkı (6).
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
        v_preview.remaining := 6;
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
    SELECT COALESCE(pl.monthly_allowance, 7200), pl.billing_period
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

-- Eski bakiyeler sıfırlanıyor; dönem bitmiş sayılıyor ki ilk işlemde yeni hak dolsun.
INSERT INTO public.credit_ledger (user_id, delta, balance_before, balance_after, entry_type, action_code, idempotency_key, metadata)
  SELECT user_id, -balance, balance, 0, 'adjustment', NULL, 'credit-system-v2-reset:' || user_id::text,
         jsonb_build_object('reason', 'credit_system_v2', 'free_before', free_allowance_remaining)
    FROM public.credit_wallets
   WHERE balance <> 0
ON CONFLICT DO NOTHING;

UPDATE public.credit_wallets
   SET balance = 0,
       free_allowance_remaining = 0,
       period_allowance = 6,
       period_ends_at = now(),
       updated_at = now();
