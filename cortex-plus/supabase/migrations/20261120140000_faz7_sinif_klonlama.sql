-- YAZILDI, UYGULANMADI.
--
-- Faz 7 (20 Kasım 2026, ürün sahibinin kararları): "📲 Sınıfla Paylaş" ve paylaşılan çalışma yolunu klonlama.
--
-- Öğrenci hazırlığının kısa, tahmin edilemez bir paylaşım kodunu (`share_code`) açar; bağlantı `/davet/<kod>`.
-- Arkadaşı bağlantıyı açıp "Bu Çalışma Yolunu Hesabıma Klonla" der: hazırlığın başlığı, sınav bilgisi, konu haritası
-- ve 1. konunun (1. ünite) önceden üretilmiş dersi arkadaşın hesabına kopyalanır (model çağrısı yok, kredi yok).
-- Belge, depolama yolu, kaynak listesi, cevap, hâkimiyet, yıldız ve sonuç kopyalanmaz.
--
-- Ödül: arkadaş klonladığı hazırlığın 1. konusunun konu testini bitirince paylaşana +50 kredi (hediye yolu:
-- `credit_gift`, soru bildirimi ödülüyle aynı). Paylaşan başına İstanbul takvim ayında en çok 5 arkadaş. Kendi kendini
-- davet, aynı posta kutusu (`normalize_email`: Gmail noktası ve +etiket), aynı IP (paylaşımın ve klonlamanın IP
-- özeti) ödül almaz. Çift başına tek ödül: 90 kredilik davet hediyesi bu arkadaş için paylaşana yazıldıysa ya da
-- davet programı bu çifti hâlâ kapsıyorsa (arkadaş paylaşanın davet koduyla gelmiş, paylaşanın 3 davet hakkı
-- dolmamış) +50 yazılmaz. Böylece mevcut `grant_referral_gift` değişmeden iki ödül aynı çifte gitmez.
--
-- Uygulama sırası: kod önce yayına çıkar (göç yokken paylaşım bugünkü imzalı davetle sürer, ödül atlanır), sonra bu
-- dosya SQL ekranında uygulanır ve aynı çalıştırmada kayıt satırı yazılır:
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261120140000', 'faz7_sinif_klonlama') on conflict (version) do nothing;
--
-- Yalnız ekleme: ADD COLUMN IF NOT EXISTS, CREATE ... IF NOT EXISTS ve yeni işlev. DROP, DELETE ve var olan verinin
-- UPDATE'i yok.

-- --- 1) Hazırlık satırı ------------------------------------------------------------------------------------------
-- Paylaşım kodu: 10 karakter, karışan harf yok (i, l, o, 0, 1). Benzersiz; NULL'lar çakışmaz.
ALTER TABLE public.exam_preps ADD COLUMN IF NOT EXISTS share_code text UNIQUE;
-- Kod açılınca true; `/davet/<kod>` yalnız bu bayrak açıkken klonlanır.
ALTER TABLE public.exam_preps ADD COLUMN IF NOT EXISTS is_public_cloneable boolean NOT NULL DEFAULT false;
-- Klonun kaynağı. Kaynak silinince bağ kopar (kopya öğrencinin kendi hazırlığıdır, silinmez).
ALTER TABLE public.exam_preps
  ADD COLUMN IF NOT EXISTS cloned_from_prep_id uuid REFERENCES public.exam_preps(id) ON DELETE SET NULL;
-- IP özeti (HMAC, geri çevrilemez; ham IP saklanmaz). Kaynak hazırlıkta: paylaşım kodunu açan son isteğin özeti.
-- Klonda: klonlayan isteğin özeti. Ödül işlevi ikisi eşitse ödül vermez.
ALTER TABLE public.exam_preps ADD COLUMN IF NOT EXISTS share_ip_hash text;

-- Aynı öğrenci aynı hazırlığı bir kez klonlar (eşzamanlı iki istekte ikincisi bu dizine takılır, eski kopya açılır).
CREATE UNIQUE INDEX IF NOT EXISTS exam_preps_clone_once
  ON public.exam_preps (user_id, cloned_from_prep_id)
  WHERE cloned_from_prep_id IS NOT NULL;

-- --- 2) Ödül kayıtları ---------------------------------------------------------------------------------------------
-- Arkadaş başına tek satır (referred_user_id benzersiz): bir arkadaş tek bir paylaşana bir kez ödül kazandırır.
-- Satır güvenliği açık, politika yok: yalnız service_role (ödül işlevi ve hesap silme).
CREATE TABLE IF NOT EXISTS public.referral_credit_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL,
  referred_user_id uuid NOT NULL UNIQUE,
  prep_id uuid NOT NULL,
  credits_awarded integer NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_credit_rewards_referrer_created
  ON public.referral_credit_rewards (referrer_user_id, created_at DESC);

ALTER TABLE public.referral_credit_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_credit_rewards FROM anon, authenticated;
GRANT ALL ON public.referral_credit_rewards TO service_role;

-- --- 3) Ödül işlevi ------------------------------------------------------------------------------------------------
-- Klon hazırlığın kimliğiyle çağrılır (tamamlama yanıttan sonra, öğrenciyi bekletmez). Durumu jsonb döndürür:
-- {status: granted | not_clone | source_missing | self | already_rewarded | unverified | same_email | same_ip |
--  wallet_missing | referral_gift | monthly_cap | gift_failed, referrer?, credits?}.
-- Tutar ve aylık tavan burada sabit (çağıran tutar seçemez); uygulamadaki eşleri `class-share.ts`'te, bekçi test
-- ikisini karşılaştırır.
CREATE OR REPLACE FUNCTION public.claim_clone_referral_reward(p_clone_prep uuid)
RETURNS jsonb AS $BODY$
DECLARE
  v_amount constant integer := 50;
  v_cap constant integer := 5;
  v_referral_cap constant integer := 3;
  v_friend uuid;
  v_source uuid;
  v_clone_ip text;
  v_referrer uuid;
  v_share_ip text;
  v_verified boolean;
  v_friend_email text;
  v_referrer_email text;
  v_referred_by uuid;
  v_month text := to_char((now() AT TIME ZONE 'UTC') + interval '3 hours', 'YYYY-MM');
  v_count integer;
BEGIN
  SELECT p.user_id, p.cloned_from_prep_id, p.share_ip_hash
    INTO v_friend, v_source, v_clone_ip
    FROM public.exam_preps p WHERE p.id = p_clone_prep;
  IF v_friend IS NULL OR v_source IS NULL THEN
    RETURN jsonb_build_object('status', 'not_clone');
  END IF;

  SELECT p.user_id, p.share_ip_hash INTO v_referrer, v_share_ip
    FROM public.exam_preps p WHERE p.id = v_source;
  IF v_referrer IS NULL THEN
    RETURN jsonb_build_object('status', 'source_missing');
  END IF;
  IF v_referrer = v_friend THEN
    RETURN jsonb_build_object('status', 'self');
  END IF;
  IF EXISTS (SELECT 1 FROM public.referral_credit_rewards r WHERE r.referred_user_id = v_friend) THEN
    RETURN jsonb_build_object('status', 'already_rewarded');
  END IF;

  -- Doğrulanmış hesap (davet hediyesiyle aynı kural: tek kullanımlık adres ve doğrulanmamış e-posta ödül kazanmaz).
  BEGIN
    v_verified := public.account_verified(v_friend);
  EXCEPTION WHEN OTHERS THEN
    v_verified := false;
  END;
  IF NOT COALESCE(v_verified, false) THEN
    RETURN jsonb_build_object('status', 'unverified');
  END IF;

  -- Aynı posta kutusu: Gmail noktası, +etiket ve googlemail aynı kutudur.
  SELECT u.email INTO v_friend_email FROM auth.users u WHERE u.id = v_friend;
  SELECT u.email INTO v_referrer_email FROM auth.users u WHERE u.id = v_referrer;
  IF v_friend_email IS NOT NULL AND v_referrer_email IS NOT NULL
     AND public.normalize_email(v_friend_email) = public.normalize_email(v_referrer_email) THEN
    RETURN jsonb_build_object('status', 'same_email');
  END IF;

  -- Aynı IP: paylaşımı açan istek ile klonlayan istek aynı yerden.
  IF v_clone_ip IS NOT NULL AND v_share_ip IS NOT NULL AND v_clone_ip = v_share_ip THEN
    RETURN jsonb_build_object('status', 'same_ip');
  END IF;

  -- Kilit: iki cüzdan kimlik sırasıyla (grant_referral_gift ile aynı sıra; karşılıklı beklemede kilitlenme olmaz),
  -- sonra paylaşanın danışma kilidi. Aynı paylaşanın iki arkadaşı aynı anda bitirse de aylık tavan aşılmaz; davet
  -- hediyesi de bu kilidin altında okunur.
  PERFORM 1 FROM public.credit_wallets w WHERE w.user_id IN (v_friend, v_referrer) ORDER BY w.user_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.credit_wallets w WHERE w.user_id = v_referrer) THEN
    RETURN jsonb_build_object('status', 'wallet_missing');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('clone_referral_reward:' || v_referrer::text));

  -- Çift başına tek ödül. 90'lık davet hediyesi bu arkadaş için paylaşana yazıldıysa +50 yok.
  IF EXISTS (
    SELECT 1 FROM public.credit_ledger l
     WHERE l.user_id = v_referrer AND l.idempotency_key = 'referral-gift-inviter:' || v_friend::text
  ) THEN
    RETURN jsonb_build_object('status', 'referral_gift');
  END IF;
  -- Davet programı çifti hâlâ kapsıyorsa (arkadaş paylaşanın koduyla gelmiş, paylaşanın davet hakkı dolmamış) 90'lık
  -- hediye arkadaşın sıradaki çalışmasında yazılacak: +50 verilmez (yoksa aynı çift iki ödül alırdı).
  SELECT pr.referred_by INTO v_referred_by FROM public.profiles pr WHERE pr.id = v_friend;
  IF v_referred_by IS NOT NULL AND v_referred_by = v_referrer AND (
    SELECT count(*) FROM public.credit_ledger l
     WHERE l.user_id = v_referrer AND l.idempotency_key LIKE 'referral-gift-inviter:%'
  ) < v_referral_cap THEN
    RETURN jsonb_build_object('status', 'referral_gift');
  END IF;

  -- Aylık tavan (İstanbul ayı, sabit UTC+3).
  SELECT count(*) INTO v_count FROM public.referral_credit_rewards r
   WHERE r.referrer_user_id = v_referrer
     AND to_char((r.created_at AT TIME ZONE 'UTC') + interval '3 hours', 'YYYY-MM') = v_month;
  IF v_count >= v_cap THEN
    RETURN jsonb_build_object('status', 'monthly_cap');
  END IF;

  -- Kayıt ve hediye birlikte: biri düşerse ikisi de geri alınır (blok kendi kayıt noktasıdır).
  BEGIN
    INSERT INTO public.referral_credit_rewards (referrer_user_id, referred_user_id, prep_id, credits_awarded)
    VALUES (v_referrer, v_friend, p_clone_prep, v_amount);
    IF NOT public.credit_gift(
      v_referrer, v_amount, 'clone-referral:' || v_friend::text,
      jsonb_build_object('reason', 'clone_referral', 'side', 'sharer', 'referred', v_friend, 'prep', p_clone_prep)
    ) THEN
      RAISE EXCEPTION 'clone_reward_gift_failed';
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('status', 'already_rewarded');
    WHEN raise_exception THEN
      RETURN jsonb_build_object('status', 'gift_failed');
  END;

  RETURN jsonb_build_object('status', 'granted', 'referrer', v_referrer, 'credits', v_amount);
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.claim_clone_referral_reward(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.claim_clone_referral_reward(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_clone_referral_reward(uuid) TO service_role;
