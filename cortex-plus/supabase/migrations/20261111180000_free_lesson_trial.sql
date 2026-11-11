-- Ücretsiz hesap = deneme için TEK ders (11 Kasım 2026 akşamı, ürün sahibinin kararı).
--   "Yeni kayıt olan denemesi için kayıtlı kullanıcıya sadece 1 ders ücretsiz vereceğiz. Daha fazlası için Plus'a
--   yönlendireceğiz." Haftalık 3 ders hakkı kalkar: ders sayacının sınırı 0. Ücretsiz hesapta açık kalan ders, ilk
--   hazırlığın 1. konusunun ilk ders döngüsüdür; uygulama o adımları "derse dahil" sayacıyla ayırır
--   (src/lib/billing/first-lesson-cycle.ts) ve buraya 'included' ile gelir. 'lesson' ile gelen iş (Çalışma
--   Stüdyosu üretimi, "Farklı anlat", verilmiş adımın yeniden yazımı, ilk olmayan hazırlık, düello kurma) ücretsiz
--   hesapta açılmaz: cüzdan bakiyesi (davet hediyesi, eski ek paket) yetiyorsa onunla, yetmiyorsa free_limit:lesson.
--   Mesaj (günde 3), fotoğraf (günde 1), derse dahil adımlar (günde 40), Plus'a özel işler, iade ve davet hediyesi
--   AYNEN kalır.
-- Asıl kapı koddadır (src/lib/billing/free-lesson-gate.ts: model çağrısından ve ayırmadan önce reddeder, SQL'e
-- güvenmez); bu göç ikinci hattır ve sayının tek SQL kaynağıdır (free_meter_limit ↔ FREE_LIMITS, bekçi test).
-- Yayın sırası: kod bu göçten ÖNCE yayına çıkabilir (kod kapısı tek başına yeter; bakiyeli ücretsiz hesabın işi
-- sayaçsız ayrılır, eski haftalık sayaç artmaz). Göç koddan önce uygulanırsa da bozulmaz: eski kod aynı reddi
-- eski cümlesiyle gösterir, ilk dersin döngüsü ('included') çalışmaya devam eder.
-- Yalnız aynı imzayla yeniden tanımlama: tablo, sütun, satır silinmez; free_usage'daki eski haftalık satırlar durur
-- (okunmaz). 20261024121000'e göre değişen iki şey: free_meter_limit('lesson') 3 → 0 ve credit_reserve_metered'in
-- sınırı 0 olan sayacı "dolu" sayması (eski gövde 0 sınırı 'invalid_meter' diye reddeder, ilk satırı da sınıra
-- bakmadan yazardı).
-- Geri almak: bu dosyadaki iki fonksiyonu 20261024121000'deki gövdeleriyle yeniden çalıştırın VE kodu geri alın
-- (kod kapısı SQL'den bağımsız reddeder; yalnız SQL'i geri almak hiçbir şeyi açmaz).
-- Kayıt satırı aynı çalıştırmada, sona:
--   insert into supabase_migrations.schema_migrations (version, name) values ('20261111180000', 'free_lesson_trial')
--     on conflict (version) do nothing;
-- Doğrulama: select public.free_meter_limit('lesson');  -- 0

CREATE OR REPLACE FUNCTION public.free_meter_limit(p_meter text)
RETURNS integer AS $BODY$
  SELECT CASE p_meter
    WHEN 'lesson' THEN 0
    WHEN 'chat' THEN 3
    WHEN 'photo' THEN 1
    WHEN 'included' THEN 40
    ELSE 0
  END;
$BODY$ LANGUAGE sql IMMUTABLE;

-- 20261024121000 ile aynı; değişen: sayacın adı listeden doğrulanır (sınır 0 artık geçerli bir değer) ve sınırı 0
-- olan sayaç free_usage'a hiç yazılmadan "dolu" sayılır.
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
  v_limit integer;
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
  IF p_meter NOT IN ('lesson', 'chat', 'photo', 'included') THEN RAISE EXCEPTION 'invalid_meter'; END IF;
  v_limit := public.free_meter_limit(p_meter);

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
  -- Sınırı 0 olan sayaç (ders): hak yok, satır yazılmaz; aşağıdaki "dolu" kolu çalışır.
  IF v_limit >= 1 THEN
    INSERT INTO public.free_usage (user_id, meter, period_key, used, updated_at)
      VALUES (p_user_id, p_meter, v_period, 1, now())
    ON CONFLICT (user_id, meter, period_key) DO UPDATE
      SET used = public.free_usage.used + 1, updated_at = now()
      WHERE public.free_usage.used < v_limit
    RETURNING used INTO v_used;
  END IF;

  IF v_used IS NULL THEN
    -- Sayaç dolu ya da sayaçta hak yok: cüzdan bakiyesi (hediye) yetiyorsa onunla. Önizlemedeki yöneticinin
    -- cüzdanı hediye değil: ücretsiz hesap gibi durur.
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
