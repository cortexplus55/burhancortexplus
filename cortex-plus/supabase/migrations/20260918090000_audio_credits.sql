-- Seslendirme artık kredi harcıyor.
--
-- --------------------------------- NEDEN ---------------------------------
--
-- Podcast SENARYOSU bugüne kadar da kredi düşürüyordu: üretim `generateJson`
-- üzerinden geçiyor ve `AI_CHAT_STANDARD` (1 kredi) ayırıyor. Bedava olan
-- şey senaryonun üstüne binen SESLENDİRMEYDİ — `/api/learning/podcast/audio`
-- ve `/api/learning/speech` hiçbir kredi düşürmüyor, tek frenleri hız
-- sınırıydı. Bu bir gözden kaçma değil, yazılı bir karardı: "ses düğümün
-- bedeline dahil".
--
-- Karar ölçüldüğünde tutmuyor. `ai_model_prices` tablosuna göre seslendirme
-- 1.000 karakter başına 0,0167 USD; metin modeli ise 1.000 jeton başına
-- 0,00015 USD (gpt-4o-mini girdi). Yani bir podcast'in parası neredeyse
-- tamamen seste: senaryo 1 kredi düşerken, o senaryonun beş dakikalık sesi
-- yaklaşık 4.500 karakter ve 0,075 USD — aynı podcast'in metin üretiminin
-- kat kat üzerinde. Ücretsiz tarafta bu zaten ölçülmüş ve ses premium'a
-- kapatılmıştı; premium tarafta hiç ölçülmedi.
--
-- ------------------------- NEDEN MİKTARLI ÜCRET --------------------------
--
-- Düz bir ücret iki yönden de yanlış olurdu. Ses önbelleği içerik adresli ve
-- PAYLAŞIMLI: aynı cümle bir kez üretilir, sonra her öğrenciye bedava gelir.
-- Düz ücret, bize hiçbir maliyeti olmayan önbellek isabetini faturalandırır.
-- Tersi de doğru: altmış satırlık yepyeni bir podcast ile tek cümlelik bir
-- seslendirmeyi aynı fiyata vermek, uzun üretimde zarara yazar.
--
-- Bu yüzden `credit_reserve` artık miktar alıyor ve ses uçları YALNIZCA
-- gerçekten üretilecek karakteri sayıp o kadar kredi ayırıyor. 900 karakter
-- = 1 kredi; kaynağı `AUDIO_CHARS_PER_CREDIT` ve fiyat tablosundaki
-- "~900 karakter/dakika" çevrimi, yani 1 kredi ≈ 1 dakika ses.
--
-- --------------------------- GERİYE UYUMLULUK ----------------------------
--
-- `p_quantity` varsayılanı 1. Mevcut eylemlerin hiçbiri parametreyi
-- göndermiyor (`/api/learning/quiz/generate` RPC'yi doğrudan, üç adlı
-- argümanla çağırıyor; varsayılan sayesinde aynı işlevde çözülüyor),
-- dolayısıyla davranışları birebir aynı kalıyor. Eski üç argümanlı imza
-- düşürülüyor ki `credit_reserve(a,b,c)` çağrısı belirsiz kalmasın.

INSERT INTO public.credit_rules (action_code, credit_cost, model_tier, description) VALUES
  ('AUDIO_SYNTHESIZE', 1, 'standard', 'Seslendirme — her 900 karakter için 1 kredi')
ON CONFLICT (action_code) DO UPDATE
  SET credit_cost = EXCLUDED.credit_cost,
      model_tier  = EXCLUDED.model_tier,
      description = EXCLUDED.description;

DROP FUNCTION IF EXISTS public.credit_reserve(uuid, text, text);

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

  /*
    Miktar. Sıfır ya da negatif bir istek ücretsiz iş anlamına gelirdi; en az
    1 sayılıyor. Üst sınır, bir hatanın cüzdanı tek hamlede boşaltmasını
    engelliyor: ses uçlarının kendi tavanları zaten çok daha düşük (podcast
    60 satır, seslendirme 2.000 karakter), yani buraya 1.000 gelmesi ancak
    bir çağrı hatasıyla olur ve o hâlde bile zarar sınırlı kalır.
  */
  v_cost := v_cost * LEAST(GREATEST(COALESCE(p_quantity, 1), 1), 1000);

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
ALTER FUNCTION public.credit_reserve(uuid, text, text, integer) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.credit_reserve(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_reserve(uuid, text, text, integer) TO service_role;
