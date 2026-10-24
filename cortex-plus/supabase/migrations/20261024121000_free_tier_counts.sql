-- Sayıya dayalı ücretsiz katman (24 Ekim 2026, ürün sahibinin kararı).
--   Ücretsiz hesap: haftada 3 ders, günde 3 sohbet mesajı, günde 1 fotoğraftan çözüm. Dersin içindeki
--   yardımcılar ve yolda o dersin ardındaki test/kartlar derse dahil ("included", günde en çok 40 iş,
--   kötüye kullanım sınırı). Araçlar'dan açılan test/kart/doğru-yanlış haftalık ders hakkından düşer.
--   Podcast, sözlü, yazılı deneme, video ve ses Plus'ta (plus_only_action).
--   Gün ve hafta İstanbul saatiyle (Türkiye 2016'dan beri yaz saati uygulamıyor: UTC+3); hafta Pazartesi
--   başlar, anahtar "2026-W43" (src/lib/feedback/weekly-survey.ts isoWeekKey ile aynı).
--   Davet çarpanının yerine iki tarafa bir kez 90 kredi hediye (3 ders kadar; Plus dışı her işte
--   harcanır, sayaç dolunca kullanılır).
-- Yalnız ekleme: yeni tablo, yeni sütun, yeni fonksiyon ve geriye uyumlu credit_refund. credit_reserve'e
-- ve var olan hiçbir varsayılana dokunmaz; bu yüzden koddan ÖNCE uygulanır ve credit_reserve'ü doğrudan
-- çağıran eski kod v2'deki gibi çalışır. Davranışı değiştiren yarı (ücretsiz günlük kredi 0)
-- 20261024123000_free_daily_zero'da, fiyat göçüyle (20261024120000) birlikte, kod yayına çıktıktan sonra.
-- credit_reserve_metered hem v2 (20261008120000) hem v3 credit_reserve'ün üstünde çalışır.
-- Tablo silinmez, fonksiyon düşürülmez.
-- Kayıt satırı aynı çalıştırmada, sona (yeniden çalıştırmada düşmesin diye on conflict):
--   insert into supabase_migrations.schema_migrations (version, name) values ('20261024121000', 'free_tier_counts')
--     on conflict (version) do nothing;
-- Kodu push etmeden önce SQL ekranında doğrulayın; `true` değilse push etmeyin (yeni kod PGRST202'de sessizce
-- sayaçsız credit_reserve'e düşer, ücretsiz fotoğraf v2 günlük hakkına sığmaz):
--   select to_regprocedure('public.credit_reserve_metered(uuid,text,text,integer,text)') is not null;

-- --- 1) Sayaçlar ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.free_usage (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  meter text NOT NULL CHECK (meter IN ('lesson', 'chat', 'photo', 'included')),
  period_key text NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, meter, period_key)
);

ALTER TABLE public.free_usage ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'free_usage' AND policyname = 'free_usage_self_read') THEN
    CREATE POLICY free_usage_self_read ON public.free_usage FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;
REVOKE ALL ON public.free_usage FROM anon;
GRANT SELECT ON public.free_usage TO authenticated;

ALTER TABLE public.credit_reservations
  ADD COLUMN IF NOT EXISTS free_meter text,
  ADD COLUMN IF NOT EXISTS free_period text;

CREATE OR REPLACE FUNCTION public.free_meter_limit(p_meter text)
RETURNS integer AS $BODY$
  SELECT CASE p_meter
    WHEN 'lesson' THEN 3
    WHEN 'chat' THEN 3
    WHEN 'photo' THEN 1
    WHEN 'included' THEN 40
    ELSE 0
  END;
$BODY$ LANGUAGE sql IMMUTABLE;

-- İstanbul günü ("YYYY-MM-DD") ya da ISO haftası ("IYYY-Www"); oturumun saat diliminden bağımsız.
CREATE OR REPLACE FUNCTION public.free_period_key(p_meter text, p_at timestamptz)
RETURNS text AS $BODY$
  SELECT CASE WHEN p_meter = 'lesson'
    THEN to_char((p_at AT TIME ZONE 'UTC') + interval '3 hours', 'IYYY-"W"IW')
    ELSE to_char((p_at AT TIME ZONE 'UTC') + interval '3 hours', 'YYYY-MM-DD')
  END;
$BODY$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.plus_only_action(p_code text)
RETURNS boolean AS $BODY$
  SELECT p_code IN ('PODCAST_GENERATE', 'ORAL_EXAM_GENERATE', 'PRACTICE_EXAM_GENERATE', 'VIDEO_GENERATE', 'VOICE_TURN', 'AUDIO_SYNTHESIZE');
$BODY$ LANGUAGE sql IMMUTABLE;

-- --- 2) Hediye kredisi (davet) ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_gift(p_user_id uuid, p_amount integer, p_key text, p_meta jsonb)
RETURNS boolean AS $BODY$
DECLARE
  w public.credit_wallets%ROWTYPE;
BEGIN
  IF p_amount <= 0 THEN RETURN false; END IF;
  SELECT * INTO w FROM public.credit_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE user_id = p_user_id AND idempotency_key = p_key) THEN RETURN false; END IF;
  UPDATE public.credit_wallets SET balance = balance + p_amount, updated_at = now() WHERE user_id = p_user_id;
  INSERT INTO public.credit_ledger (user_id, delta, balance_before, balance_after, entry_type, action_code, idempotency_key, metadata)
    VALUES (p_user_id, p_amount, w.balance, w.balance + p_amount, 'grant', NULL, p_key, COALESCE(p_meta, '{}'::jsonb));
  RETURN true;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

-- Davetle gelen ve hesabını doğrulayan öğrenci ilk çalışmasını yapınca (ücretsiz, Plus ya da denemede):
-- kendisine ve davet edene bir kez 90 kredi. Davet eden en çok 3 davet için alır (referral_counted ile
-- aynı sınır).
CREATE OR REPLACE FUNCTION public.grant_referral_gift(p_user_id uuid)
RETURNS void AS $BODY$
DECLARE
  v_inviter uuid;
  v_gift integer := 90;
  v_verified boolean;
BEGIN
  SELECT referred_by INTO v_inviter FROM public.profiles WHERE id = p_user_id;
  IF v_inviter IS NULL OR v_inviter = p_user_id THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE user_id = p_user_id AND idempotency_key = 'referral-gift:' || p_user_id::text) THEN
    RETURN;
  END IF;
  BEGIN
    v_verified := public.account_verified(p_user_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
  IF NOT COALESCE(v_verified, false) THEN RETURN; END IF;
  -- Hediyeden önce iki cüzdan birden, kimlik sırasıyla kilitlenir. Karşılıklı davette (A'yı B, B'yi A
  -- davet etmiş; kayıt yalnız kendini davet etmeyi engelliyor) ikisi aynı anda ilk işini yapınca her işlem
  -- önce kendi cüzdanını, sonra ötekini kilitleseydi birbirini beklerdi (40P01, istek düşer); sabit sırada
  -- ikincisi birincinin bitmesini bekler. Davet edenin sayımı da bu kilidin altında: aynı anda ilk işini
  -- yapan iki davetli 3 sınırını aşamaz (ikincisi kilidi bekler, sayım birincinin yazdığı satırı görür).
  -- credit_gift aynı satırları yeniden kilitler; aynı işlemde bu bekletmez.
  PERFORM 1 FROM public.credit_wallets WHERE user_id IN (p_user_id, v_inviter) ORDER BY user_id FOR UPDATE;
  PERFORM public.credit_gift(p_user_id, v_gift, 'referral-gift:' || p_user_id::text,
    jsonb_build_object('reason', 'referral', 'side', 'invitee', 'inviter', v_inviter));
  IF (SELECT count(*) FROM public.credit_ledger WHERE user_id = v_inviter AND idempotency_key LIKE 'referral-gift-inviter:%') < 3 THEN
    PERFORM public.credit_gift(v_inviter, v_gift, 'referral-gift-inviter:' || p_user_id::text,
      jsonb_build_object('reason', 'referral', 'side', 'inviter', 'invitee', p_user_id));
  END IF;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

-- --- 3) Sayaçlı ayırma: uygulamanın tek giriş noktası ---------------------------------
-- Abone ve (önizleme kapalı) yönetici: credit_reserve. Ücretsiz (ve önizlemedeki yönetici, aboneliği
-- olsa bile): Plus işi → plus_required; sayaç varsa tutar 0, sayaç bir artar; sayaç dolduysa hediye
-- bakiyesi yetiyorsa credit_reserve, yetmiyorsa free_limit:<sayaç>. Sayaçsız iş (belge) credit_reserve'e
-- gider. Davet hediyesi her koldan önce: Plus ya da denemeyle gelen davetli de iki tarafa hediye açar.
CREATE OR REPLACE FUNCTION public.credit_reserve_metered(
  p_user_id uuid,
  p_action_code text,
  p_idempotency_key text,
  p_quantity integer DEFAULT 1,
  p_meter text DEFAULT NULL
)
RETURNS uuid AS $BODY$
DECLARE
  v_premium boolean;
  v_admin boolean;
  v_preview boolean := false;
  v_cost integer;
  v_wallet public.credit_wallets%ROWTYPE;
  v_previous public.credit_reservations%ROWTYPE;
  v_attempt integer := 1;
  v_period text;
  v_used integer;
  v_res_id uuid;
BEGIN
  v_admin := public.is_admin(p_user_id);
  -- Hediye bir kez verildikten sonra tek sorgu (deftere bakıp döner).
  IF NOT v_admin THEN PERFORM public.grant_referral_gift(p_user_id); END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
      JOIN public.plans pl ON pl.id = s.plan_id
     WHERE s.user_id = p_user_id
       AND s.status = 'active'
       AND pl.is_premium
       AND (s.current_period_end IS NULL OR s.current_period_end > now())
  ) INTO v_premium;
  IF v_admin THEN
    v_preview := EXISTS (SELECT 1 FROM public.admin_free_preview WHERE user_id = p_user_id);
  END IF;
  -- Önizlemeye abonelikten önce bakılır: aboneliği olan kurucu da önizlemede ücretsiz hesap gibi sayaca
  -- girer (uygulamadaki plan çözücü de önizlemede ücretsiz döner).
  IF NOT v_preview AND (v_premium OR v_admin) THEN
    RETURN public.credit_reserve(p_user_id, p_action_code, p_idempotency_key, p_quantity);
  END IF;

  IF public.plus_only_action(p_action_code) THEN RAISE EXCEPTION 'plus_required'; END IF;
  IF p_meter IS NULL THEN
    RETURN public.credit_reserve(p_user_id, p_action_code, p_idempotency_key, p_quantity);
  END IF;
  IF public.free_meter_limit(p_meter) < 1 THEN RAISE EXCEPTION 'invalid_meter'; END IF;

  SELECT credit_cost INTO v_cost FROM public.credit_rules
    WHERE action_code = p_action_code AND active = true;
  IF v_cost IS NULL THEN RAISE EXCEPTION 'invalid_action'; END IF;
  v_cost := v_cost * LEAST(GREATEST(COALESCE(p_quantity, 1), 1), 1000);

  SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  SELECT * INTO v_previous FROM public.credit_reservations
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_previous.action_code <> p_action_code THEN RAISE EXCEPTION 'operation_action_mismatch'; END IF;
    IF v_previous.status <> 'refunded' THEN RETURN v_previous.id; END IF;
    v_attempt := v_previous.attempt + 1;
  END IF;

  v_period := public.free_period_key(p_meter, now());
  INSERT INTO public.free_usage (user_id, meter, period_key, used, updated_at)
    VALUES (p_user_id, p_meter, v_period, 1, now())
  ON CONFLICT (user_id, meter, period_key) DO UPDATE
    SET used = public.free_usage.used + 1, updated_at = now()
    WHERE public.free_usage.used < public.free_meter_limit(p_meter)
  RETURNING used INTO v_used;

  IF v_used IS NULL THEN
    -- Sayaç doldu: hediye bakiyesi yetiyorsa onunla. Önizlemedeki yöneticinin cüzdanı hediye değil:
    -- ücretsiz hesap gibi durur.
    IF NOT v_preview AND v_wallet.balance >= v_cost THEN
      RETURN public.credit_reserve(p_user_id, p_action_code, p_idempotency_key, p_quantity);
    END IF;
    RAISE EXCEPTION 'free_limit:%', p_meter;
  END IF;

  IF v_previous.id IS NOT NULL THEN
    UPDATE public.credit_reservations SET
      operation_key = COALESCE(operation_key, p_idempotency_key),
      idempotency_key = p_idempotency_key || ':refunded:' || id::text
      WHERE id = v_previous.id;
  END IF;
  INSERT INTO public.credit_reservations (user_id, action_code, amount, free_spent, allowance_period_end, idempotency_key, operation_key, attempt, free_meter, free_period)
    VALUES (p_user_id, p_action_code, 0, 0, v_wallet.period_ends_at, p_idempotency_key, p_idempotency_key, v_attempt, p_meter, v_period)
    RETURNING id INTO v_res_id;
  INSERT INTO public.credit_ledger (user_id, delta, balance_before, balance_after, entry_type, action_code, idempotency_key, reference_id, metadata)
    VALUES (
      p_user_id, 0, v_wallet.balance, v_wallet.balance, 'reserve', p_action_code,
      CASE WHEN v_attempt = 1 THEN p_idempotency_key ELSE p_idempotency_key || ':attempt:' || v_attempt END,
      v_res_id,
      jsonb_build_object('free_meter', p_meter, 'free_period', v_period, 'nominal_cost', v_cost, 'attempt', v_attempt, 'free_preview', v_preview)
    );
  RETURN v_res_id;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.credit_reserve_metered(uuid, text, text, integer, text) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.credit_reserve_metered(uuid, text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_reserve_metered(uuid, text, text, integer, text) TO service_role;
ALTER FUNCTION public.credit_gift(uuid, integer, text, jsonb) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.credit_gift(uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_gift(uuid, integer, text, jsonb) TO service_role;
ALTER FUNCTION public.grant_referral_gift(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.grant_referral_gift(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_referral_gift(uuid) TO service_role;

-- --- 4) İade: sayaç aynı dönemdeyse geri verilir -------------------------------------
-- 20261008100000 ile aynı; eklenen yalnız sayaç kolu (free_meter boşsa eski davranış).
CREATE OR REPLACE FUNCTION public.credit_refund(p_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.credit_reservations%ROWTYPE; w public.credit_wallets%ROWTYPE; paid integer; free integer;
BEGIN
  SELECT * INTO r FROM public.credit_reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN RETURN; END IF;
  -- All settlement paths use wallet -> reservation order.
  SELECT * INTO w FROM public.credit_wallets WHERE user_id = r.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  SELECT * INTO r FROM public.credit_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF r.status <> 'pending' THEN RETURN; END IF;
  IF r.amount = 0 THEN
    UPDATE public.credit_reservations SET status = 'refunded' WHERE id = r.id;
    -- Ücretsiz sayaç (24 Ekim 2026): aynı gün/haftaysa hak geri döner; dönem geçtiyse dönmez.
    IF r.free_meter IS NOT NULL AND r.free_period = public.free_period_key(r.free_meter, now()) THEN
      UPDATE public.free_usage SET used = GREATEST(used - 1, 0), updated_at = now()
        WHERE user_id = r.user_id AND meter = r.free_meter AND period_key = r.free_period;
    END IF;
    -- Önizleme kaydı: aynı günün hakkı geri döner; gün geçtiyse dönmez.
    IF r.free_spent > 0 THEN
      UPDATE public.admin_free_preview
        SET remaining = remaining + r.free_spent
        WHERE user_id = r.user_id
          AND period_ends_at = r.allowance_period_end
          AND now() < period_ends_at;
    END IF;
    RETURN;
  END IF;
  paid := r.amount - r.free_spent;
  -- Expired allowance cannot inflate the next period or become paid credits.
  free := CASE WHEN r.allowance_period_end = w.period_ends_at AND now() < w.period_ends_at THEN r.free_spent ELSE 0 END;
  UPDATE public.credit_reservations SET status = 'refunded' WHERE id = r.id;
  UPDATE public.credit_wallets SET balance = balance + paid,
    free_allowance_remaining = free_allowance_remaining + free,
    reserved = reserved - r.amount, updated_at = now() WHERE user_id = r.user_id;
  INSERT INTO public.credit_ledger(user_id, delta, balance_before, balance_after, entry_type, action_code, reference_id, metadata)
    VALUES (r.user_id, paid + free, w.balance, w.balance + paid, 'refund', r.action_code, r.id,
      jsonb_build_object('free_restored', free, 'paid_restored', paid, 'expired_free', r.free_spent - free));
END;
$$;

REVOKE ALL ON FUNCTION public.credit_refund(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_refund(uuid) TO service_role;
