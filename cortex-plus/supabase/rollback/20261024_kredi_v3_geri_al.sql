-- Kredi v3'ü geri alma (24 Ekim 2026). Bu bir göç DEĞİL: supabase/migrations'a konmaz, schema_migrations'a
-- satır yazılmaz, `supabase db push` ile çalışmaz. SQL ekranında elle, TEK çalıştırmada.
--
-- Ne zaman: 20261024120000 (fiyatlar) ve 20261024123000 (ücretsiz günlük kredi 0) canlıdayken kodu v3
-- öncesine geri almak gerekirse (Vercel Instant Rollback ya da git revert). Eski kod credit_reserve'ü
-- doğrudan çağırır: v3 fiyatları (ders 30, test 10) ve günlük kredi 0 ile eski kodda ücretsiz öğrenci
-- hiçbir ders ya da test açamaz. Sıra: ÖNCE bu dosya, SONRA kod geri alınır (docs/ops/yayin-geri-alma.md, C).
--
-- Ne yapar: v2 fiyatlarını (20261008120000), v2 credit_reserve'ü (ücretsiz günde 6, davet çarpanı,
-- önizleme günde 6), doğrulanmamış hesabın günlük 6'sını ve eski sütun varsayılanlarını geri koyar; v3'te
-- 0 ile açılmış bugünkü ücretsiz günlük dönemleri bitirir. Sonuç "yalnız 20261024121000" durumudur: o
-- durum hem eski hem yeni kodla güvenli (yeni kod sayaçlı fonksiyonu v2 credit_reserve'ün üstünde çağırır).
--
-- Ne yapmaz: hiçbir şey silmez. free_usage, credit_reserve_metered, credit_gift, grant_referral_gift ve
-- sayaçlı credit_refund yerinde kalır; verilmiş davet hediyeleri ve sayaç satırları durur. Yıllık planlar
-- satışa kendiliğinden dönmez (en altta, isteğe bağlı ve yorum satırı).
--
-- Sonra: göç kayıt tablosundaki 20261024120000 ve 20261024123000 satırları silinmez. Yeniden v3'e
-- geçerken o iki göç kod yayına çıktıktan sonra yine aynı çalıştırmada uygulanır (ikisi de yeniden
-- çalıştırılabilir). Kayıt satırları zaten var: insert `on conflict (version) do nothing` ile yazılır
-- (20261024123000'in başındaki satır). Onsuz insert duplicate key ile düşer; tek çalıştırma tek işlem
-- olduğu için iki göç de uygulanmaz. Bekçi: tests/unit/free-tier-counts.test.ts ("geri alma").
--
-- Kabul edilen boşluk, davet çarpanı: v3 credit_reserve çarpanı uygulamaz. (c) ile bu dosya arasında dönemi
-- yenilenen abone cüzdanı (aylık, haftalık) hakkını çarpansız aldı: davetle gelen Plus 21.600 yerine 7.200.
-- Bu dosya abonelik dönemlerine dokunmaz; v2 çarpanı o cüzdanın bir sonraki yenilemesinde (en çok 30 gün
-- sonra) geri gelir. Tamamlama bilerek yazılmadı: 24 Ekim 2026'da canlıda etkin ücretli abonelik ve artı
-- bakiyeli cüzdan yoktu, boşluk kimseyi etkilemiyor. Aboneler varken geri almak gerekirse önce bu paragrafa
-- yeniden bakın. Bekçi aynı testte: v3 yenilemesi 7.200, geri almadan sonraki yenileme 21.600.

-- --- 1) Fiyatlar: v2 (20261008120000) ----------------------------------------------
-- 20261008120000 ile 20261024120000 arasında bu altı satırı değiştiren başka göç yok.
UPDATE public.credit_rules SET credit_cost = c.cost, updated_at = now()
  FROM (VALUES
    ('STUDY_PLAN_GENERATE', 6),
    ('QUIZ_GENERATE', 4),
    ('FLASHCARD_GENERATE', 3),
    ('DOCUMENT_PAGE_PROCESS', 2),
    ('IMAGE_SOLUTION', 10),
    ('ORAL_EXAM_GENERATE', 8)
  ) AS c(code, cost)
 WHERE credit_rules.action_code = c.code;

-- --- 2) Günlük hak ve varsayılanlar: v2 ---------------------------------------------
-- Doğrulanmamış hesap ücretsizle aynı günlük hak (20261008120000).
CREATE OR REPLACE FUNCTION public.unverified_allowance()
RETURNS integer AS $BODY$ SELECT 6; $BODY$ LANGUAGE sql IMMUTABLE;

-- Önizleme günde 6 (20261008120000); yeni cüzdan 50 (ilk göçten, 20250825120000, beri), dönem hakkı 6
-- (sütunu ekleyen 20260903150000'den beri; arada değiştiren göç yok).
ALTER TABLE public.admin_free_preview ALTER COLUMN remaining SET DEFAULT 6;
ALTER TABLE public.credit_wallets ALTER COLUMN free_allowance_remaining SET DEFAULT 50;
ALTER TABLE public.credit_wallets ALTER COLUMN period_allowance SET DEFAULT 6;

-- --- 3) credit_reserve: 20261008120000'deki gövde, harfi harfine ---------------------
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

-- --- 4) v3'te 0 ile açılan bugünkü ücretsiz günler biter -----------------------------
-- Yoksa ücretsiz öğrenci gece yarısına (UTC) kadar 0 hakla kalırdı. Yalnız günlük ve boşalmış dönemler:
-- sonraki istek credit_reserve'de v2 hakkıyla (6, davet çarpanıyla) açar. Abonelik dönemlerine,
-- bakiyelere ve deftere dokunulmaz (abonelikte çarpan: başlıktaki "Kabul edilen boşluk").
UPDATE public.credit_wallets
   SET period_ends_at = now(), updated_at = now()
 WHERE period_kind = 'daily'
   AND period_ends_at > now()
   AND free_allowance_remaining = 0;

UPDATE public.admin_free_preview
   SET period_ends_at = now()
 WHERE period_ends_at > now()
   AND remaining < 6;

-- --- 5) İsteğe bağlı: yıllık planları yeniden satışa açmak ----------------------------
-- 20261024122000 kod yayından bağımsız; geri alma için gerekmez. Yalnız ürün sahibi isterse yorumdan
-- çıkarın (plans_held_by_user politikası kalabilir, zararsız).
-- UPDATE public.plans SET active = true, updated_at = now()
--  WHERE slug IN ('plus-yillik', 'sigma-yillik') AND active = false;
