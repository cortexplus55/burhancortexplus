-- Faz 4 / ADIM 2 — Akıllı kavrama ve kredi motoru: kredi ekonomisi (19 Kasım 2026, Burhan'ın kararı, t307u).
-- Fiyatlar (₺) DEĞİŞMEZ. Yalnız UPDATE / INSERT ... ON CONFLICT ve aynı imzayla fonksiyon yeniden tanımı: tablo, sütun
-- ve satır silinmez. İki kez çalışınca aynı sonuç (idempotent).
--
-- 1) Plan havuzları: Sınav Haftası 2.700 → 2.500, Plus aylık 7.200 → 4.350, Sigma 60.000 → 14.500
--    (satıştan kalkmış yıllık satırlar aynı aylık hakka hizalanır). Ek paketler S/M/L 1.000/2.500/5.750 → 900/2.350/5.400.
--    GRANDFATHERING: cüzdanlara dokunulmaz. `credit_reserve` dönem bitince (period_ends_at ≤ now, cüzdan dönemi aboneliğin
--    bitişini geçmez) yeni hakkı plandan okur; eldeki hak current_period_end'e kadar aynen kalır, yeni tavan yalnız yeni
--    abonelikte ve yenilemede yazılır.
-- 2) İşlem bedelleri (ilk üretim): sohbet 3 → 1, doğru/yanlış testten ayrı 3 (yeni kod), sözlü 6 → 3, "Farklı anlat" 4
--    (yeni kod, önce sohbet fiyatı), kartlar (ilk 8) 4 → 8, test 10 → 14, podcast 12 → 16, yazılı deneme başlangıçta
--    tek atomik 17 (notlandırma ve karne 0), ders 30 → 22, çizimli video 25 → 22.
--    Belge (yalnız ilk yükleme): metin sayfası 5'te 1 kredi (DOCUMENT_PAGE_PROCESS birimi = 5 metin sayfası),
--    fotoğraf / taranmış (Vision OCR) sayfa 5 kredi (DOCUMENT_SCAN_PAGE, toplam bedel; metin biriminden düşer).
-- 3) Ücretsiz sayaçlar: "Farklı anlat" kendi sayacında ('reexplain'), ilk ders döngüsü boyunca TOPLAM 10 (dönemsiz
--    anahtar 'trial'); fotoğraftan çözüm ayda 7 (aylık anahtar YYYY-MM, İstanbul); sohbet günde 3 aynen.
--    credit_reserve_metered 20261111180000'deki gövdesiyle aynı; değişen yalnız sayaç listesine 'reexplain' eklenmesi.
-- Kayıt satırı aynı çalıştırmada, sona:
--   insert into supabase_migrations.schema_migrations (version, name) values ('20261119120000', 'faz4_credit_economy')
--     on conflict (version) do nothing;
-- Doğrulama:
--   select action_code, credit_cost from public.credit_rules order by 1;
--   select slug, monthly_allowance, credit_amount from public.plans order by sort_order;
--   select public.free_meter_limit('reexplain'), public.free_meter_limit('photo'), public.free_period_key('photo', now());

-- 1) Kredi kuralları ------------------------------------------------------------------------------------------------
INSERT INTO public.credit_rules (action_code, credit_cost, model_tier, description, active)
VALUES
  ('AI_CHAT_STANDARD', 1, 'standard', 'Sohbet mesajı (Faz 4: 1 kredi)', true),
  ('AI_CHAT_ADVANCED', 1, 'standard', 'Gelişmiş sohbet mesajı (Faz 4: 1 kredi)', true),
  ('TRUE_FALSE_GENERATE', 3, 'standard', 'Doğru/yanlış (testten ayrı, Faz 4: 3 kredi)', true),
  ('ORAL_EXAM_GENERATE', 3, 'standard', 'Sözlü deneme (Faz 4: 3 kredi)', true),
  ('STEP_REEXPLAIN', 4, 'standard', 'Ders adımını farklı anlat (Faz 4: 4 kredi; adım başına önbellek)', true),
  ('FLASHCARD_GENERATE', 8, 'standard', 'Kartlar — ilk 8 kart (Faz 4: 8 kredi; kayıtlı deste 0)', true),
  ('QUIZ_GENERATE', 14, 'standard', 'Konu testi (Faz 4: 14 kredi)', true),
  ('PODCAST_GENERATE', 16, 'standard', 'Podcast (Faz 4: 16 kredi)', true),
  ('PRACTICE_EXAM_GENERATE', 17, 'standard', 'Yazılı deneme — başlangıçta tek atomik ücret, notlandırma ve karne dahil (Faz 4: 17)', true),
  ('PRACTICE_EXAM_GRADE', 0, 'standard', 'Deneme notlandırma ve karne (başlangıç ücretine dahil, 0)', true),
  ('STUDY_PLAN_GENERATE', 22, 'standard', 'Ders (Faz 4: 22 kredi)', true),
  ('SKETCH_VIDEO_GENERATE', 22, 'standard', 'Çizimli video (Faz 4: 22 kredi)', true),
  ('DOCUMENT_PAGE_PROCESS', 1, 'standard', 'Metin PDF/DOCX/PPTX: 5 metin sayfası başına 1 kredi, yalnız ilk yükleme (Faz 4)', true),
  ('DOCUMENT_SCAN_PAGE', 5, 'standard', 'Fotoğraf / taranmış (Vision OCR) sayfa: sayfa başına 5 kredi, yalnız ilk yükleme (Faz 4)', true)
ON CONFLICT (action_code) DO UPDATE
  SET credit_cost = EXCLUDED.credit_cost,
      description = EXCLUDED.description,
      active = true,
      updated_at = now();

-- 2) Plan havuzları ve ek paketler (fiyat aynı) ---------------------------------------------------------------------
-- DİKKAT: abonelik satırlarının credit_amount'u 0 kalır (finalize_paytr_payment credit_amount'u bakiyeye EKLER);
-- abonelik hakkı yalnız monthly_allowance'tan okunur.
UPDATE public.plans SET monthly_allowance = 2500, updated_at = now()
  WHERE slug = 'plus-haftalik' AND monthly_allowance IS DISTINCT FROM 2500;
UPDATE public.plans SET monthly_allowance = 4350, updated_at = now()
  WHERE slug IN ('plus-aylik', 'plus-yillik') AND monthly_allowance IS DISTINCT FROM 4350;
UPDATE public.plans SET monthly_allowance = 14500, updated_at = now()
  WHERE slug IN ('sigma-aylik', 'sigma-yillik') AND monthly_allowance IS DISTINCT FROM 14500;
UPDATE public.plans SET credit_amount = 900, updated_at = now() WHERE slug = 'ek-kredi-50' AND credit_amount IS DISTINCT FROM 900;
UPDATE public.plans SET credit_amount = 2350, updated_at = now() WHERE slug = 'ek-kredi-150' AND credit_amount IS DISTINCT FROM 2350;
UPDATE public.plans SET credit_amount = 5400, updated_at = now() WHERE slug = 'ek-kredi-400' AND credit_amount IS DISTINCT FROM 5400;

-- 3) Ücretsiz sayaçlar ----------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.free_meter_limit(p_meter text)
RETURNS integer AS $BODY$
  SELECT CASE p_meter
    WHEN 'lesson' THEN 0
    WHEN 'chat' THEN 3
    WHEN 'photo' THEN 7
    WHEN 'included' THEN 40
    WHEN 'reexplain' THEN 10
    ELSE 0
  END;
$BODY$ LANGUAGE sql IMMUTABLE;

-- Ders sayacı haftalık (eski kayıtlar), fotoğraf aylık, "Farklı anlat" dönemsiz ('trial'), öteki sayaçlar günlük (İstanbul).
CREATE OR REPLACE FUNCTION public.free_period_key(p_meter text, p_at timestamptz)
RETURNS text AS $BODY$
  SELECT CASE
    WHEN p_meter = 'lesson' THEN to_char((p_at AT TIME ZONE 'UTC') + interval '3 hours', 'IYYY-"W"IW')
    WHEN p_meter = 'reexplain' THEN 'trial'
    WHEN p_meter = 'photo' THEN to_char((p_at AT TIME ZONE 'UTC') + interval '3 hours', 'YYYY-MM')
    ELSE to_char((p_at AT TIME ZONE 'UTC') + interval '3 hours', 'YYYY-MM-DD')
  END;
$BODY$ LANGUAGE sql STABLE;

-- Sayaç adı kısıtı genişler (daraltma yok): yeni 'reexplain' satırı yazılabilsin.
ALTER TABLE public.free_usage DROP CONSTRAINT IF EXISTS free_usage_meter_check;
ALTER TABLE public.free_usage ADD CONSTRAINT free_usage_meter_check
  CHECK (meter = ANY (ARRAY['lesson'::text, 'chat'::text, 'photo'::text, 'included'::text, 'reexplain'::text]));

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
  IF p_meter NOT IN ('lesson', 'chat', 'photo', 'included', 'reexplain') THEN RAISE EXCEPTION 'invalid_meter'; END IF;
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
