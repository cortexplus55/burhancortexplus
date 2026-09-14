-- Haftalık Plus paketi.
--
-- Gerekçe: sınav haftasındaki öğrenci bir yıla, çoğu zaman bir aya da
-- bağlanmıyor; iki haftaya bağlanıyor. Rakip ürün haftalığı 450 TL'ye satıyor
-- ve bu onların en akıllı hamlesi: hem kısa vadeli öğrenciyi yakalıyor hem
-- aylık paketi cazip gösteriyor. Bizde 599 TL'nin altında hiçbir giriş yoktu.
--
-- Fiyat 349 TL, hak 150 kredi (ürün sahibi kararı, 14 Eylül 2026).
-- Aya vurunca ~1.500 TL eder, yani aylığın 2,5 katı: haftalık bilerek pahalı
-- ki aylık paketi yemesin.

-- --- 1) billing_period haftalığı tanısın ----------------------------------
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_billing_period_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_billing_period_check
  CHECK (billing_period IN ('one_time', 'weekly', 'monthly', 'yearly'));

COMMENT ON COLUMN public.plans.period_days IS
  'Aboneliğin bir ödemeyle açtığı gün sayısı (7 / 30 / 365)';

-- --- 2) Satıştaki paket ---------------------------------------------------
INSERT INTO public.plans
  (slug, name, description, price_try, credit_amount, is_premium, active,
   sort_order, billing_period, tier, period_days, monthly_allowance)
VALUES
  ('plus-haftalik', 'Plus', 'Sınav haftası için', 34900, 0, true, true,
   0, 'weekly', 'plus', 7, 150)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  description       = EXCLUDED.description,
  price_try         = EXCLUDED.price_try,
  is_premium        = EXCLUDED.is_premium,
  active            = EXCLUDED.active,
  sort_order        = EXCLUDED.sort_order,
  billing_period    = EXCLUDED.billing_period,
  tier              = EXCLUDED.tier,
  period_days       = EXCLUDED.period_days,
  monthly_allowance = EXCLUDED.monthly_allowance,
  updated_at        = now();

-- --- 3) Kota penceresi planın dönemini izlesin ----------------------------
-- Önceki hâlde her abonede pencere 30 güne sabitti. Haftalık abonede bu,
-- 150 krediyi bir ay boyunca kullandırmak olurdu: öğrenci ödediği haftadan
-- sonra da hak sahibi görünürdü. Pencere artık plandan geliyor —
-- haftalıkta 7 gün, aylık ve yıllıkta 30 gün (yıllık abone, yıl boyunca
-- ayda bir yenilenen hakkı kullanır).
CREATE OR REPLACE FUNCTION public.credit_reserve(p_user_id uuid, p_action_code text, p_idempotency_key text)
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
BEGIN
  SELECT id INTO v_existing FROM public.credit_reservations
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT credit_cost INTO v_cost FROM public.credit_rules
    WHERE action_code = p_action_code AND active = true;
  IF v_cost IS NULL THEN RAISE EXCEPTION 'invalid_action'; END IF;

  SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.user_id IS NOT NULL AND now() >= v_wallet.period_ends_at THEN
    -- Aboneliği olan kullanıcıda planın kotası ve dönemi; yoksa NULL döner.
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

    -- Doğrulama kontrolündeki geçici bir sorun kota yenilemesini durdurmasın.
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

    -- Davet çarpanı yalnızca doğrulanmış veya premium hesaba uygulanır.
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

  UPDATE public.credit_wallets
    SET reserved = reserved + v_cost,
        free_allowance_remaining = GREATEST(0, free_allowance_remaining - LEAST(free_allowance_remaining, v_cost)),
        balance = balance - GREATEST(0, v_cost - LEAST(free_allowance_remaining, v_cost)),
        updated_at = now()
    WHERE user_id = p_user_id;

  INSERT INTO public.credit_reservations (user_id, action_code, amount, idempotency_key)
    VALUES (p_user_id, p_action_code, v_cost, p_idempotency_key)
    RETURNING id INTO v_res_id;

  INSERT INTO public.credit_ledger (user_id, delta, balance_after, entry_type, action_code, idempotency_key, reference_id)
    SELECT p_user_id, -v_cost, w.balance, 'reserve', p_action_code, p_idempotency_key, v_res_id
    FROM public.credit_wallets w WHERE w.user_id = p_user_id;

  RETURN v_res_id;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

-- CREATE OR REPLACE, fonksiyonun `SET search_path` ayarını korumuyor; yeniden
-- yazılmazsa SECURITY DEFINER bir fonksiyon sabitlenmemiş arama yoluyla kalır.
-- Yetkiler de canlıdaki hâliyle aynı kalsın diye birlikte tekrarlanıyor.
ALTER FUNCTION public.credit_reserve(uuid, text, text) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.credit_reserve(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_reserve(uuid, text, text) TO service_role;
