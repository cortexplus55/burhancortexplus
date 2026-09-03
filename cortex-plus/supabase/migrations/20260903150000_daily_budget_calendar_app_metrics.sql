-- ============================================================================
-- Faz 2 — Günlük bütçe kotası, takvim ve uygulama metrikleri
--
-- Tamamen additive: hiçbir tablo/kolon silinmiyor. credit_reserve() yalnızca
-- başına bir "dönem yenileme" adımı kazanıyor; sonrasındaki davranışı aynı,
-- yani tüm AI rotaları değişmeden çalışmaya devam ediyor.
--
-- Bu dosya SQL editöründe çalıştırılan hâlin birebir kaydıdır. Her ifade tek
-- satır ve tekrar çalıştırılabilir; fonksiyon gövdeleri zorunlu istisna.
--
-- Editör notu: satır sonunda çıplak THEN bırakmayın — otomatik tamamlama onu
-- sonraki satırla birleştirip "thenSELECT" gibi sözdizimi hatası üretiyor.
-- Bu yüzden IF ... THEN ve gövdesi aynı satırda.
-- ============================================================================

-- --- 1) Kota dönemi ---------------------------------------------------------
-- free_allowance_remaining zaten vardı ama hiç yenilenmiyordu: 50 hak bitince
-- kullanıcı ancak kredi satın alarak devam edebiliyordu. Artık dönem sonunda
-- kendini yeniliyor. Satın alınmış balance dokunulmadan duruyor ve bütçe
-- bittiğinde üstüne ek kapasite olarak kullanılıyor — kimse ödediğini kaybetmiyor.
ALTER TABLE public.credit_wallets ADD COLUMN IF NOT EXISTS period_allowance integer NOT NULL DEFAULT 6;
ALTER TABLE public.credit_wallets ADD COLUMN IF NOT EXISTS period_ends_at timestamptz NOT NULL DEFAULT (date_trunc('day', now()) + interval '1 day');
ALTER TABLE public.credit_wallets ADD COLUMN IF NOT EXISTS period_kind text NOT NULL DEFAULT 'daily';
ALTER TABLE public.credit_wallets DROP CONSTRAINT IF EXISTS credit_wallets_period_kind_check;
ALTER TABLE public.credit_wallets ADD CONSTRAINT credit_wallets_period_kind_check CHECK (period_kind IN ('daily','monthly'));

-- --- 2) credit_reserve: dönem yenileme adımı -------------------------------
-- Gövdenin tamamı orijinalin aynısı; tek fark cüzdan okunduktan hemen sonra
-- eklenen yenileme bloğu. Ücretsiz günlük 6, abone 30 günde 400 kredi alır.
-- UTC gün başı, Türkiye saatiyle 03:00'e denk gelir.
CREATE OR REPLACE FUNCTION public.credit_reserve(p_user_id uuid, p_action_code text, p_idempotency_key text) RETURNS uuid AS $BODY$
DECLARE
v_cost integer; v_wallet public.credit_wallets%ROWTYPE; v_res_id uuid; v_existing uuid; v_premium boolean; v_allowance integer; v_kind text; v_ends timestamptz;
BEGIN
SELECT id INTO v_existing FROM public.credit_reservations WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
SELECT credit_cost INTO v_cost FROM public.credit_rules WHERE action_code = p_action_code AND active = true;
IF v_cost IS NULL THEN RAISE EXCEPTION 'invalid_action'; END IF;
SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_user_id FOR UPDATE;
IF v_wallet.user_id IS NOT NULL AND now() >= v_wallet.period_ends_at THEN SELECT EXISTS (SELECT 1 FROM public.subscriptions s JOIN public.plans pl ON pl.id = s.plan_id WHERE s.user_id = p_user_id AND s.status = 'active' AND pl.is_premium) INTO v_premium; IF v_premium THEN v_allowance := 400; v_kind := 'monthly'; v_ends := date_trunc('day', now()) + interval '30 days'; ELSE v_allowance := 6; v_kind := 'daily'; v_ends := date_trunc('day', now()) + interval '1 day'; END IF; UPDATE public.credit_wallets SET free_allowance_remaining = v_allowance, period_allowance = v_allowance, period_kind = v_kind, period_ends_at = v_ends, updated_at = now() WHERE user_id = p_user_id; SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_user_id FOR UPDATE; END IF;
IF v_wallet.balance - v_wallet.reserved < v_cost AND v_wallet.free_allowance_remaining < v_cost THEN RAISE EXCEPTION 'insufficient_credits'; END IF;
UPDATE public.credit_wallets SET reserved = reserved + v_cost, free_allowance_remaining = GREATEST(0, free_allowance_remaining - LEAST(free_allowance_remaining, v_cost)), balance = balance - GREATEST(0, v_cost - LEAST(free_allowance_remaining, v_cost)), updated_at = now() WHERE user_id = p_user_id;
INSERT INTO public.credit_reservations (user_id, action_code, amount, idempotency_key) VALUES (p_user_id, p_action_code, v_cost, p_idempotency_key) RETURNING id INTO v_res_id;
INSERT INTO public.credit_ledger (user_id, delta, balance_after, entry_type, action_code, idempotency_key, reference_id) SELECT p_user_id, -v_cost, w.balance, 'reserve', p_action_code, p_idempotency_key, v_res_id FROM public.credit_wallets w WHERE w.user_id = p_user_id;
RETURN v_res_id;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.credit_reserve(uuid, text, text) SET search_path = public, pg_temp;

-- --- 3) Takvim etkinlikleri -------------------------------------------------
-- Sınav tarihleri exam_preps.exam_date'ten türetilir, burada kopyalanmaz;
-- bu tablo yalnızca kullanıcının kendi eklediği etkinlikleri tutar.
CREATE TABLE IF NOT EXISTS public.calendar_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, title text NOT NULL, event_date date NOT NULL, subject text, note text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS calendar_events_user_date ON public.calendar_events (user_id, event_date);
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_events_owner ON public.calendar_events;
CREATE POLICY calendar_events_owner ON public.calendar_events FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- --- 4) Uygulama metrikleri -------------------------------------------------
-- app_id, lab-apps.ts'teki katalog kimliği (serbest metin) — katalog kodda
-- yaşadığı için yabancı anahtar yok.
CREATE TABLE IF NOT EXISTS public.lab_app_plays (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, app_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS lab_app_plays_app ON public.lab_app_plays (app_id);
CREATE INDEX IF NOT EXISTS lab_app_plays_user ON public.lab_app_plays (user_id, created_at DESC);
ALTER TABLE public.lab_app_plays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lab_app_plays_insert_own ON public.lab_app_plays;
CREATE POLICY lab_app_plays_insert_own ON public.lab_app_plays FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS lab_app_plays_read_own ON public.lab_app_plays;
CREATE POLICY lab_app_plays_read_own ON public.lab_app_plays FOR SELECT USING (user_id = auth.uid());

-- Kullanıcı başına tek puan; tekrar oy verirse günceller.
CREATE TABLE IF NOT EXISTS public.lab_app_ratings (user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, app_id text NOT NULL, rating smallint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, app_id));
ALTER TABLE public.lab_app_ratings DROP CONSTRAINT IF EXISTS lab_app_ratings_rating_check;
ALTER TABLE public.lab_app_ratings ADD CONSTRAINT lab_app_ratings_rating_check CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE public.lab_app_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lab_app_ratings_owner ON public.lab_app_ratings;
CREATE POLICY lab_app_ratings_owner ON public.lab_app_ratings FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Toplu sayılar herkese açık olmalı (katalogdaki "44k oynanma" gibi) ama tekil
-- satırlar değil. RLS satırları kişiye kapatır; toplamlar bu güvenlik
-- tanımlayıcı fonksiyondan gelir.
CREATE OR REPLACE FUNCTION public.lab_app_stats() RETURNS TABLE (app_id text, plays bigint, rating_avg numeric, rating_count bigint) AS $BODY$ SELECT COALESCE(p.app_id, r.app_id) AS app_id, COALESCE(p.plays, 0) AS plays, ROUND(r.rating_avg, 1) AS rating_avg, COALESCE(r.rating_count, 0) AS rating_count FROM (SELECT app_id, count(*) AS plays FROM public.lab_app_plays GROUP BY app_id) p FULL OUTER JOIN (SELECT app_id, avg(rating)::numeric AS rating_avg, count(*) AS rating_count FROM public.lab_app_ratings GROUP BY app_id) r ON p.app_id = r.app_id; $BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.lab_app_stats() SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.lab_app_stats() TO authenticated;
