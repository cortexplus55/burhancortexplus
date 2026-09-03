-- ============================================================================
-- Referans ödülü: davet çarpanı
--
-- Astra'da gözlemlenen mekanik (Kullanım limitleri diyaloğu, 2026-09-03):
--   "0/3 davet kullanıldı"
--   "Yeni bir arkadaşın kaydolduğunda ikiniz de 3 kat günlük kullanım hakkı
--    kazanırsınız. O da abone olursa seninki 400 kata çıkar."
--
-- Yani üç ayrı ödül var:
--   1. Davet EDİLEN, kaydolduğu anda 3 kat alır (kalıcı).
--   2. Davet EDEN, her kaydolan davet için 3 kat alır.
--   3. Davet edilen abone olursa, davet EDENin çarpanı 400'e çıkar.
-- Sayılan davet sayısı 3 ile sınırlı. Çarpanlar toplanmaz — "400 kata ÇIKAR"
-- ifadesi en iyisinin geçerli olduğunu söylüyor, o yüzden max alınıyor.
--
-- Ayrı bir referral_rewards tablosu açmıyoruz: veri zaten profiles.referred_by
-- ve subscriptions içinde duruyor. İkinci bir kopya tutmak senkron hatası
-- üretir. Her şey bu iki kaynaktan türetiliyor.
--
-- MALİYET UYARISI: 400 çarpanı ücretsiz katmanın 6 birimlik günlük bütçesini
-- 2400'e çıkarır. Astra'nın ilan ettiği sayı bu, ama OpenAI faturası bizde.
-- Sayıları koda gömmek yerine referral_tiers tablosuna koyduk; kısmak için
-- tek bir UPDATE yeterli, yeni migration gerekmiyor.
--
-- Tamamen additive.
-- ============================================================================

-- --- 1) Ayarlanabilir çarpanlar ---------------------------------------------

CREATE TABLE IF NOT EXISTS public.referral_tiers (
  status text PRIMARY KEY,
  multiplier integer NOT NULL,
  note text
);

ALTER TABLE public.referral_tiers DROP CONSTRAINT IF EXISTS referral_tiers_status_check;
ALTER TABLE public.referral_tiers ADD CONSTRAINT referral_tiers_status_check
  CHECK (status IN ('invitee', 'signed_up', 'subscribed'));

ALTER TABLE public.referral_tiers DROP CONSTRAINT IF EXISTS referral_tiers_multiplier_check;
ALTER TABLE public.referral_tiers ADD CONSTRAINT referral_tiers_multiplier_check
  CHECK (multiplier BETWEEN 1 AND 1000);

INSERT INTO public.referral_tiers (status, multiplier, note) VALUES
  ('invitee',    3,   'Davetle kaydolan kullanicinin kalici odulu'),
  ('signed_up',  3,   'Davet edilen kaydoldu'),
  ('subscribed', 400, 'Davet edilen abone oldu')
ON CONFLICT (status) DO NOTHING;

ALTER TABLE public.referral_tiers ENABLE ROW LEVEL SECURITY;

-- credit_rules ile ayni sinif: gizli olmayan yapilandirma, herkes okuyabilir.
DROP POLICY IF EXISTS referral_tiers_read ON public.referral_tiers;
CREATE POLICY referral_tiers_read ON public.referral_tiers
  FOR SELECT USING (true);

-- Kim kimi davet etti sorgusu her kota yenilemesinde calisiyor.
CREATE INDEX IF NOT EXISTS profiles_referred_by_idx
  ON public.profiles (referred_by) WHERE referred_by IS NOT NULL;

-- Davet kodu benzersiz olmali; iki profil ayni kodu tasirsa davet yanlis
-- kisiye baglanir. Kodlar bugune kadar uygulama tarafinda uretildi ve
-- benzersizlik zorlanmadi, o yuzden once cakisanlari temizliyoruz: en eski
-- profil kodu tutar, digerleri NULL'a doner ve /davet ilk ziyarette yenisini
-- uretir. Bu adim olmadan indeks yaratimi migration'i komple dusurur.
UPDATE public.profiles p
   SET referral_code = NULL
 WHERE p.referral_code IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.profiles q
     WHERE q.referral_code = p.referral_code
       AND (q.created_at < p.created_at
            OR (q.created_at = p.created_at AND q.id < p.id))
   );

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key
  ON public.profiles (referral_code) WHERE referral_code IS NOT NULL;

-- --- 2) Sayilan davetler ----------------------------------------------------

-- Bir kullanicinin davetleri, en degerlisi basta olacak sekilde, en fazla
-- MAX_REFERRALS tanesi. Aboneler once geliyor: kullanici 3 davet sinirindan
-- en yuksek faydayi gorsun.
CREATE OR REPLACE FUNCTION public.referral_counted(p_user_id uuid)
RETURNS TABLE (invitee_id uuid, subscribed boolean)
AS $BODY$
  -- ORDER BY, cikti kolonu adi yerine ic sorgunun kolonuna baksin diye
  -- iki katmanli: RETURNS TABLE adlariyla cakismasin.
  SELECT r.id, r.is_sub
  FROM (
    SELECT p.id,
           p.created_at,
           EXISTS (
             SELECT 1
             FROM public.subscriptions s
             JOIN public.plans pl ON pl.id = s.plan_id
             WHERE s.user_id = p.id AND s.status = 'active' AND pl.is_premium
           ) AS is_sub
    FROM public.profiles p
    WHERE p.referred_by = p_user_id
  ) r
  ORDER BY r.is_sub DESC, r.created_at ASC
  LIMIT 3;
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

-- --- 3) Etkin carpan --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.referral_multiplier(p_user_id uuid)
RETURNS integer
AS $BODY$
DECLARE
  v_invitee integer := 1;
  v_best integer := 1;
  v_tier_invitee integer;
  v_tier_signup integer;
  v_tier_sub integer;
BEGIN
  SELECT multiplier INTO v_tier_invitee FROM public.referral_tiers WHERE status = 'invitee';
  SELECT multiplier INTO v_tier_signup  FROM public.referral_tiers WHERE status = 'signed_up';
  SELECT multiplier INTO v_tier_sub     FROM public.referral_tiers WHERE status = 'subscribed';

  -- Tablo bos ya da eksikse carpan uygulanmasin; sessizce 1'e dus.
  v_tier_invitee := COALESCE(v_tier_invitee, 1);
  v_tier_signup  := COALESCE(v_tier_signup, 1);
  v_tier_sub     := COALESCE(v_tier_sub, 1);

  -- Davet EDILEN olarak kalici odul.
  SELECT CASE WHEN referred_by IS NOT NULL THEN v_tier_invitee ELSE 1 END
    INTO v_invitee
  FROM public.profiles WHERE id = p_user_id;

  -- Davet EDEN olarak en iyi davetin degeri.
  SELECT COALESCE(MAX(CASE WHEN c.subscribed THEN v_tier_sub ELSE v_tier_signup END), 1)
    INTO v_best
  FROM public.referral_counted(p_user_id) c;

  RETURN GREATEST(COALESCE(v_invitee, 1), COALESCE(v_best, 1), 1);
END;
$BODY$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- --- 4) Arayuz ozeti --------------------------------------------------------

-- Astra'nin rozetindeki "0/3 davet kullanildi" ve carpan metni icin.
-- Carpanlari da donduruyor: arayuzdeki "N katina cikar" metni referral_tiers
-- ile ayni sayiyi soylesin. Tabloyu kisip metni guncellemeyi unutma riski
-- boylece ortadan kalkiyor.
CREATE OR REPLACE FUNCTION public.referral_summary()
RETURNS TABLE (
  used_count integer,
  max_count integer,
  subscribed_count integer,
  multiplier integer,
  is_invitee boolean,
  signup_multiplier integer,
  subscribed_multiplier integer
)
AS $BODY$
  SELECT
    (SELECT count(*)::integer FROM public.referral_counted(auth.uid())),
    3,
    (SELECT count(*)::integer FROM public.referral_counted(auth.uid()) c WHERE c.subscribed),
    public.referral_multiplier(auth.uid()),
    COALESCE((SELECT referred_by IS NOT NULL FROM public.profiles WHERE id = auth.uid()), false),
    COALESCE((SELECT multiplier FROM public.referral_tiers WHERE status = 'signed_up'), 1),
    COALESCE((SELECT multiplier FROM public.referral_tiers WHERE status = 'subscribed'), 1);
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

-- --- 5) Carpani kota yenilemesine bagla -------------------------------------

-- 20260903150000 icindeki surumun aynisi; tek fark v_allowance'in
-- referral_multiplier ile carpilmasi ve tavan kontrolu.
CREATE OR REPLACE FUNCTION public.credit_reserve(p_user_id uuid, p_action_code text, p_idempotency_key text)
RETURNS uuid AS $BODY$
DECLARE
  v_cost integer;
  v_wallet public.credit_wallets%ROWTYPE;
  v_res_id uuid;
  v_existing uuid;
  v_premium boolean;
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
    SELECT EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.plans pl ON pl.id = s.plan_id
      WHERE s.user_id = p_user_id AND s.status = 'active' AND pl.is_premium
    ) INTO v_premium;

    IF v_premium THEN
      v_allowance := 400;
      v_kind := 'monthly';
      v_ends := date_trunc('day', now()) + interval '30 days';
    ELSE
      v_allowance := 6;
      v_kind := 'daily';
      v_ends := date_trunc('day', now()) + interval '1 day';
    END IF;

    -- Davet carpani. Hata durumunda kota yenilemesi cokmesin diye korumali.
    BEGIN
      v_mult := public.referral_multiplier(p_user_id);
    EXCEPTION WHEN OTHERS THEN
      v_mult := 1;
    END;
    v_allowance := LEAST(v_allowance * GREATEST(COALESCE(v_mult, 1), 1), 100000);

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
