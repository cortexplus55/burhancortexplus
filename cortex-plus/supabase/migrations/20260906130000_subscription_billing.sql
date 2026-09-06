-- Abonelik faturalandırması: aylık/yıllık kademeler, dönem takibi, yenileme hatırlatması.
--
-- Buraya kadar `plans` tek seferlik kredi paketiydi. Ödeme gelince
-- `subscriptions` satırı 30 gün açılıyor, sonra sessizce ölüyordu: öğrenci ne
-- zaman biteceğini görmüyordu, kimse hatırlatmıyordu, yıllık diye bir şey yoktu.
-- Fiyatlandırma sayfasındaki "Yıllık · %58 tasarruf" düğmesi de sahteydi —
-- ekrandaki rakamı değiştiriyor, kasada aylık planı çekiyordu.
--
-- Fiyatlar kuruş cinsinden: price_try = 59900 → ₺599,00.

-- --- 1) Planlar: fatura dönemi, kademe, aylık kota -------------------------

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS tier text,
  ADD COLUMN IF NOT EXISTS period_days integer,
  ADD COLUMN IF NOT EXISTS monthly_allowance integer;

ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_billing_period_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_billing_period_check
  CHECK (billing_period IN ('one_time', 'monthly', 'yearly'));

COMMENT ON COLUMN public.plans.billing_period IS
  'one_time = kredi paketi, monthly/yearly = abonelik';
COMMENT ON COLUMN public.plans.tier IS
  'plus | sigma — aylık ve yıllık aynı kademeyi paylaşır';
COMMENT ON COLUMN public.plans.period_days IS
  'Aboneliğin bir ödemeyle açtığı gün sayısı (30 / 365)';
COMMENT ON COLUMN public.plans.monthly_allowance IS
  'Aylık kota. credit_reserve() dönem yenilerken bunu kullanır.';

-- --- 2) Abonelikler: dönem başı, iptal niyeti, hatırlatma izi --------------

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS billing_period text,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renewal_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_notified_at timestamptz;

COMMENT ON COLUMN public.subscriptions.auto_renew IS
  'PayTR Non3D + Direkt API yetkisi gelene kadar false — yenileme hatırlatmayla.';
COMMENT ON COLUMN public.subscriptions.renewal_reminder_sent_at IS
  'Bu dönem için hatırlatma gönderildiyse dolu. Her dönemde sıfırlanır.';

-- Mevcut premium abonelikleri aylık dönem olarak işaretle; geçmiş kayıtlar
-- plan silmeden yeni dönem alanlarını kullanabilsin.
UPDATE public.subscriptions s
   SET current_period_start = COALESCE(s.current_period_start, s.created_at, now()),
       billing_period = COALESCE(s.billing_period,
         CASE WHEN pl.is_premium THEN 'monthly' ELSE 'one_time' END),
       updated_at = now()
  FROM public.plans pl
 WHERE s.plan_id = pl.id;

-- Aynı kullanıcıda iki "active" satır olursa callback maybeSingle() ile patlar.
-- Hiçbir satır silinmiyor: eskiler yalnızca inactive'e çekiliyor.
UPDATE public.subscriptions s
   SET status = 'inactive', updated_at = now()
 WHERE s.status = 'active'
   AND s.id <> (
     SELECT s2.id FROM public.subscriptions s2
      WHERE s2.user_id = s.user_id AND s2.status = 'active'
      ORDER BY s2.current_period_end DESC NULLS LAST, s2.updated_at DESC
      LIMIT 1
   );

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_active_per_user
  ON public.subscriptions (user_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS subscriptions_period_end_idx
  ON public.subscriptions (current_period_end)
  WHERE status = 'active';

-- --- 3) Satıştaki paketler -------------------------------------------------
-- Eski tek seferlik paketler satıştan kalkıyor; satırlar duruyor çünkü geçmiş
-- ödemeler onlara bağlı.

UPDATE public.plans
   SET active = false, billing_period = 'one_time', updated_at = now()
 WHERE slug NOT IN ('plus-aylik', 'plus-yillik', 'sigma-aylik', 'sigma-yillik');

-- Fiyatlar Astra AI'ın 5 Eylül 2026 tarihli vitrininden %22 aşağıda:
-- Astra Plus ₺770/ay ve ₺3.852/yıl, Sigma ₺2.567/ay.
INSERT INTO public.plans
  (slug, name, description, price_try, credit_amount, is_premium, active,
   sort_order, billing_period, tier, period_days, monthly_allowance)
VALUES
  ('plus-aylik',   'Plus',  'Günlük öğrenme için',  59900, 0, true, true, 1, 'monthly', 'plus',   30,  400),
  ('plus-yillik',  'Plus',  'Günlük öğrenme için', 299000, 0, true, true, 2, 'yearly',  'plus',  365,  400),
  ('sigma-aylik',  'Sigma', 'Ciddi çalışma için',  199900, 0, true, true, 3, 'monthly', 'sigma',  30, 1600),
  ('sigma-yillik', 'Sigma', 'Ciddi çalışma için',  999000, 0, true, true, 4, 'yearly',  'sigma', 365, 1600)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  description       = EXCLUDED.description,
  price_try         = EXCLUDED.price_try,
  credit_amount     = EXCLUDED.credit_amount,
  is_premium        = EXCLUDED.is_premium,
  active            = EXCLUDED.active,
  sort_order        = EXCLUDED.sort_order,
  billing_period    = EXCLUDED.billing_period,
  tier              = EXCLUDED.tier,
  period_days       = EXCLUDED.period_days,
  monthly_allowance = EXCLUDED.monthly_allowance,
  updated_at        = now();

-- --- 4) Kota yenilemesi kademeyi tanısın ------------------------------------
-- Önceki hâlde her premium kullanıcı 400/ay alıyordu; Sigma kartında yazan
-- "daha yüksek aylık kullanım hakkı" kodda karşılığı olmayan bir sözdü.
-- Artık kota planın kendi `monthly_allowance` değerinden geliyor.

CREATE OR REPLACE FUNCTION public.credit_reserve(p_user_id uuid, p_action_code text, p_idempotency_key text)
RETURNS uuid AS $BODY$
DECLARE
  v_cost integer;
  v_wallet public.credit_wallets%ROWTYPE;
  v_res_id uuid;
  v_existing uuid;
  v_plan_allowance integer;
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
    -- Aboneliği olan kullanıcıda planın aylık kotası, yoksa NULL döner.
    SELECT COALESCE(pl.monthly_allowance, 400) INTO v_plan_allowance
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
      v_kind := 'monthly';
      v_ends := date_trunc('day', now()) + interval '30 days';
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

ALTER FUNCTION public.credit_reserve(uuid, text, text) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.credit_reserve(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_reserve(uuid, text, text) TO service_role;
