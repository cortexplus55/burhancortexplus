-- UYGULANDI: 20 Kasım 2026, #714 yayınından sonra (Supabase SQL ekranı + kayıt satırı; docs/operasyon/goc-kayitlari.md).
--
-- Faz 8 (20 Kasım 2026, ürün sahibinin kararı): sınıf klonlama ödülünde (+50 kredi) katı "aynı IP" engeli kalkar; yerine
-- "aynı IP'den günde en çok 3 davet ödülü" gelir. Aynı yurt ya da okul Wi-Fi'ındaki gerçek sınıf arkadaşları artık ödül
-- getirebilir; tek ağdan toplu hesap açıp ödül toplamak günde 3 ile sınırlı. Kendini davet, aynı posta kutusu
-- (normalize_email), doğrulanmış hesap, çift başına tek ödül ve paylaşan başına ayda 5 arkadaş aynen kalır.
--
-- Yalnız ekleme ve işlevin yeniden tanımı: `referral_credit_rewards.referred_ip_hash` (klonlayan isteğin IP özeti; ham IP
-- saklanmaz) ve dizini; `claim_clone_referral_reward` aynı imzayla. DROP, DELETE ve var olan verinin UPDATE'i yok. Var
-- olan ödül satırlarında IP özeti boş kalır (o satırlar günlük sayıma girmez; bugünden önceki günlere ait).
--
-- Uygulama sırası: kod önce (işlevin yeni durumu `ip_daily_cap` kodda tanınır), sonra bu dosya SQL ekranında, aynı
-- çalıştırmada kayıt satırıyla:
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261120160000', 'faz8_davet_ip_gunluk') on conflict (version) do nothing;

ALTER TABLE public.referral_credit_rewards ADD COLUMN IF NOT EXISTS referred_ip_hash text;

CREATE INDEX IF NOT EXISTS referral_credit_rewards_ip_created
  ON public.referral_credit_rewards (referred_ip_hash, created_at DESC)
  WHERE referred_ip_hash IS NOT NULL;

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
  v_day text := to_char((now() AT TIME ZONE 'UTC') + interval '3 hours', 'YYYY-MM-DD');
  v_ip_daily_cap constant integer := 3;
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

  -- Faz 8 (20 Kasım 2026, ürün sahibinin kararı): aynı IP artık kendi başına engel değil (aynı yurt/okul Wi-Fi'ındaki
  -- gerçek sınıf arkadaşları engelleniyordu). Yerine aynı IP'den (klonlayan isteğin özeti) İstanbul gününde en çok 3
  -- ödül; aşağıda paylaşanın kilidinden sonra, IP'nin kendi kilidi altında sayılır.

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

  -- Aynı IP'den günlük tavan (İstanbul günü). Farklı paylaşanlara giden ödüller aynı IP'den aynı anda gelebilir: IP'nin
  -- kendi danışma kilidi sayımı ve yazımı sıraya koyar. IP özeti yoksa (eski klon) bu sınır uygulanmaz.
  IF v_clone_ip IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('clone_referral_reward_ip:' || v_clone_ip));
    IF (
      SELECT count(*) FROM public.referral_credit_rewards r
       WHERE r.referred_ip_hash = v_clone_ip
         AND to_char((r.created_at AT TIME ZONE 'UTC') + interval '3 hours', 'YYYY-MM-DD') = v_day
    ) >= v_ip_daily_cap THEN
      RETURN jsonb_build_object('status', 'ip_daily_cap');
    END IF;
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
    INSERT INTO public.referral_credit_rewards (referrer_user_id, referred_user_id, prep_id, credits_awarded, referred_ip_hash)
    VALUES (v_referrer, v_friend, p_clone_prep, v_amount, v_clone_ip);
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
