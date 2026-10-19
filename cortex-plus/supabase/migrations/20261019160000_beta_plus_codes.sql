-- Kapalı beta: tek kullanımlık "14 gün Plus" kodları ve öğrencinin kod girmesi
-- (19 Ekim 2026, satışa hazırlık plan Faz 5; ürün sahibinin kararı: "2 hafta ücretsiz Plus kodu").
--
-- Kodlar yönetim panelinden toplu üretilir (/admin/promosyonlar). Öğrenci kodu Abonelik
-- sayfasında girer; Plus kodun gün sayısı kadar açılır, bitince hesap kendiliğinden ücretsize
-- döner (abonelik süresi geçince yetki düşer, cüzdan dönemi aynı gün biter). Ücret alınmaz,
-- ödeme kaydı yazılmaz; gelir raporları ödemelerden okunduğu için deneme gelir sayılmaz.
--
-- Aynı fonksiyon eski kampanya kodlarını (hediye kredi) da kullandırır: kodlar panelde
-- üretilebiliyordu ama öğrencinin girebileceği bir yer hiç yoktu.
--
-- Yalnız ekleme: yeni kolonlar, yeni fonksiyon. Silme yok.

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS plus_days integer
    CHECK (plus_days IS NULL OR plus_days BETWEEN 1 AND 90),
  ADD COLUMN IF NOT EXISTS batch text;

COMMENT ON COLUMN public.promo_codes.plus_days IS
  'Doluysa kod bu kadar gün Plus açar (beta denemesi). Bir hesap Plus denemesini bir kez alır.';
COMMENT ON COLUMN public.promo_codes.batch IS
  'Toplu üretilen kodların grup adı (ör. beta-1). Yalnız yönetim panelinde görünür.';

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_until timestamptz;

COMMENT ON COLUMN public.subscriptions.trial_until IS
  'Kodla açılan Plus denemesinin bitişi. current_period_end buna eşitken abonelik denemedir; öğrenci ödeme yaparsa dönem uzar, eşitlik bozulur ve abonelik ücretli sayılır.';

CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_user_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(btrim(COALESCE(p_code, '')));
  v_promo public.promo_codes%ROWTYPE;
  v_plan_id uuid;
  v_plan_allowance integer;
  v_sub_id uuid;
  v_end timestamptz;
  v_allowance integer;
  v_balance integer;
BEGIN
  IF p_user_id IS NULL OR v_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;

  SELECT * INTO v_promo FROM public.promo_codes WHERE code = v_code FOR UPDATE;
  IF NOT FOUND OR NOT v_promo.active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;
  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.promo_redemptions
     WHERE promo_code_id = v_promo.id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_redeemed');
  END IF;
  IF v_promo.max_redemptions IS NOT NULL
     AND v_promo.redemption_count >= v_promo.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'used_up');
  END IF;

  IF v_promo.plus_days IS NOT NULL THEN
    -- Bir hesap Plus denemesini bir kez alır; ikinci kodla deneme uzatılmaz.
    IF EXISTS (
      SELECT 1
        FROM public.promo_redemptions r
        JOIN public.promo_codes c ON c.id = r.promo_code_id
       WHERE r.user_id = p_user_id AND c.plus_days IS NOT NULL
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'trial_used');
    END IF;
    -- Ücretli Plus/Sigma'sı süren öğrenciye deneme açılmaz (ödediği dönem ezilmesin).
    IF EXISTS (
      SELECT 1
        FROM public.subscriptions s
        JOIN public.plans pl ON pl.id = s.plan_id
       WHERE s.user_id = p_user_id
         AND s.status = 'active'
         AND pl.is_premium
         AND (s.current_period_end IS NULL OR s.current_period_end > now())
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_premium');
    END IF;

    SELECT id, COALESCE(monthly_allowance, 7200)
      INTO v_plan_id, v_plan_allowance
      FROM public.plans
     WHERE slug = 'plus-aylik'
     LIMIT 1;
    IF v_plan_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'plan_missing');
    END IF;

    v_end := now() + make_interval(days => v_promo.plus_days);
    -- Aylık Plus hakkı gün sayısıyla orantılı (14 gün = 7.200 × 14 / 30 = 3.360).
    v_allowance := GREATEST(1, round(v_plan_allowance * v_promo.plus_days / 30.0))::integer;

    -- Kullanıcı başına tek etkin abonelik (subscriptions_one_active_per_user): önce
    -- süresi geçmiş ama henüz kapanmamış satır, yoksa en son satır güncellenir.
    SELECT id INTO v_sub_id
      FROM public.subscriptions
     WHERE user_id = p_user_id
     ORDER BY (status = 'active') DESC, updated_at DESC
     LIMIT 1
     FOR UPDATE;

    IF v_sub_id IS NOT NULL THEN
      UPDATE public.subscriptions
         SET plan_id = v_plan_id,
             status = 'active',
             current_period_start = now(),
             current_period_end = v_end,
             billing_period = 'monthly',
             cancel_at_period_end = false,
             auto_renew = false,
             renewal_reminder_sent_at = NULL,
             expired_notified_at = NULL,
             trial_until = v_end,
             updated_at = now()
       WHERE id = v_sub_id;
    ELSE
      INSERT INTO public.subscriptions (
        user_id, plan_id, status, current_period_start, current_period_end,
        billing_period, cancel_at_period_end, trial_until
      ) VALUES (
        p_user_id, v_plan_id, 'active', now(), v_end, 'monthly', false, v_end
      );
    END IF;

    -- Cüzdan dönemi denemeyle aynı gün biter; ertesi istekte credit_reserve aboneliği
    -- bitmiş bulur ve ücretsiz günlük hakka döner.
    INSERT INTO public.credit_wallets (user_id, balance, reserved)
    VALUES (p_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.credit_wallets
       SET free_allowance_remaining = GREATEST(free_allowance_remaining, v_allowance),
           period_allowance = v_allowance,
           period_kind = 'monthly',
           period_ends_at = v_end,
           updated_at = now()
     WHERE user_id = p_user_id;
  END IF;

  IF COALESCE(v_promo.credit_amount, 0) > 0 THEN
    INSERT INTO public.credit_wallets (user_id, balance, reserved)
    VALUES (p_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.credit_wallets
       SET balance = balance + v_promo.credit_amount,
           updated_at = now()
     WHERE user_id = p_user_id
    RETURNING balance INTO v_balance;

    INSERT INTO public.credit_ledger (
      user_id, delta, balance_after, entry_type, action_code, idempotency_key, reference_id, metadata
    ) VALUES (
      p_user_id, v_promo.credit_amount, v_balance, 'grant', 'PROMO_CODE',
      'promo:' || v_promo.id::text, v_promo.id, jsonb_build_object('code', v_promo.code)
    );
  END IF;

  INSERT INTO public.promo_redemptions (promo_code_id, user_id)
  VALUES (v_promo.id, p_user_id);

  UPDATE public.promo_codes
     SET redemption_count = redemption_count + 1
   WHERE id = v_promo.id;

  INSERT INTO public.notifications (user_id, title, body)
  VALUES (
    p_user_id,
    CASE WHEN v_promo.plus_days IS NOT NULL THEN 'Plus denemen açıldı' ELSE 'Kod kullanıldı' END,
    CASE WHEN v_promo.plus_days IS NOT NULL
         THEN v_promo.plus_days || ' gün Plus senin: '
              || to_char(v_end AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY')
              || ' tarihine kadar. Bitince ücretsiz hesapla devam edersin; ücret alınmaz.'
         ELSE 'Hediye kullanım hakkı hesabına eklendi.' END
  );

  RETURN jsonb_build_object(
    'ok', true,
    'plusDays', v_promo.plus_days,
    'plusUntil', v_end,
    'credits', COALESCE(v_promo.credit_amount, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_promo_code(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_promo_code(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code(uuid, text) TO service_role;
