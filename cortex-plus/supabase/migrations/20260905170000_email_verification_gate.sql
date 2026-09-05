-- Doğrulanmamış hesap ve tek kullanımlık e-posta.
--
-- Sömürü şöyle işliyordu: kendi davet kodunla üç hesap açarsan çarpanın 3'e
-- çıkıyor, açtığın her hesap da davet edilmiş sayılıp 3 kat alıyor. Dört
-- hesapla günde 6 yerine 72 ücretsiz işlem. Hiçbir adımda e-posta
-- doğrulanmak zorunda değildi.
--
-- Buradaki düzeltme hesap açmayı engellemiyor — engelleseydik gerçek
-- öğrenciyi de kapıda bırakırdık. Yaptığı şey ödülü doğrulamaya bağlamak:
-- doğrulanmamış hesap davet olarak sayılmıyor ve kendi ücretsiz hakkı da
-- tadımlık kalıyor. Sömürünün getirisi sıfıra iniyor, gerçek öğrenci
-- e-postasındaki bağlantıya tıkladığı anda tam hakkına kavuşuyor.
--
-- Mevcut kullanıcılar bundan etkilenmiyor: kesim tarihinden önce açılmış
-- hesaplar eskisi gibi çalışıyor. Doğrulama ayarı sonradan açılmış olabilir
-- ve yayındaki kimsenin hakkı bir gecede düşmemeli.

-- --- 1) Tek kullanımlık e-posta alan adları ---------------------------------

CREATE TABLE IF NOT EXISTS public.blocked_email_domains (
  domain text PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blocked_email_domains ENABLE ROW LEVEL SECURITY;

-- Gizli olmayan yapılandırma; kayıt formu okuyabilmeli.
DROP POLICY IF EXISTS blocked_email_domains_read ON public.blocked_email_domains;
CREATE POLICY blocked_email_domains_read ON public.blocked_email_domains
  FOR SELECT USING (true);

INSERT INTO public.blocked_email_domains (domain, note) VALUES
  ('mailinator.com', 'tek kullanimlik'),
  ('guerrillamail.com', 'tek kullanimlik'),
  ('guerrillamail.info', 'tek kullanimlik'),
  ('sharklasers.com', 'guerrillamail takma adi'),
  ('grr.la', 'guerrillamail takma adi'),
  ('10minutemail.com', 'tek kullanimlik'),
  ('10minutemail.net', 'tek kullanimlik'),
  ('temp-mail.org', 'tek kullanimlik'),
  ('tempmail.com', 'tek kullanimlik'),
  ('tempmailo.com', 'tek kullanimlik'),
  ('throwawaymail.com', 'tek kullanimlik'),
  ('yopmail.com', 'tek kullanimlik'),
  ('yopmail.fr', 'tek kullanimlik'),
  ('trashmail.com', 'tek kullanimlik'),
  ('dispostable.com', 'tek kullanimlik'),
  ('fakeinbox.com', 'tek kullanimlik'),
  ('getnada.com', 'tek kullanimlik'),
  ('maildrop.cc', 'tek kullanimlik'),
  ('mohmal.com', 'tek kullanimlik'),
  ('emailondeck.com', 'tek kullanimlik'),
  ('mailnesia.com', 'tek kullanimlik'),
  ('spamgourmet.com', 'tek kullanimlik'),
  ('mytemp.email', 'tek kullanimlik'),
  ('tempr.email', 'tek kullanimlik'),
  ('inboxkitten.com', 'tek kullanimlik'),
  ('linshiyouxiang.net', 'tek kullanimlik'),
  ('mail-temp.com', 'tek kullanimlik'),
  ('minuteinbox.com', 'tek kullanimlik'),
  ('vpsboard.xyz', 'tek kullanimlik')
ON CONFLICT (domain) DO NOTHING;

-- --- 2) Hesap doğrulanmış mı ------------------------------------------------

-- Bu tarihten önce açılan hesaplar kural dışı. Sabit bir gün: kesimi
-- "now()" yapsaydık her migration çalıştırmasında sınır kayardı.
CREATE OR REPLACE FUNCTION public.account_grandfathered(p_user_id uuid)
RETURNS boolean AS $BODY$
  SELECT COALESCE(
    (SELECT created_at < timestamptz '2026-09-05 00:00:00+00'
       FROM public.profiles WHERE id = p_user_id),
    false);
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

/**
 * Hesap ödül almaya uygun mu.
 *
 * Google ile gelen kullanıcı zaten doğrulanmış sayılıyor — sağlayıcı
 * e-postayı bizim için doğrulamış oluyor, ikinci bir tıklama istemek
 * gereksiz sürtünme olurdu.
 */
CREATE OR REPLACE FUNCTION public.account_verified(p_user_id uuid)
RETURNS boolean AS $BODY$
DECLARE
  v_confirmed timestamptz;
  v_email text;
  v_domain text;
BEGIN
  IF public.account_grandfathered(p_user_id) THEN
    RETURN true;
  END IF;

  SELECT u.email_confirmed_at, lower(u.email)
    INTO v_confirmed, v_email
    FROM auth.users u WHERE u.id = p_user_id;

  IF v_confirmed IS NULL THEN
    RETURN false;
  END IF;

  -- Doğrulanmış olsa bile tek kullanımlık adres ödül kazanmıyor: o kutuya
  -- gelen bağlantıya tıklamak bedava.
  v_domain := split_part(COALESCE(v_email, ''), '@', 2);
  IF v_domain <> '' AND EXISTS (
    SELECT 1 FROM public.blocked_email_domains b WHERE b.domain = v_domain
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$BODY$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- --- 3) Doğrulanmamış davet sayılmaz ---------------------------------------

-- 20260904000000 içindeki sürümün aynısı; tek fark davet edilenin
-- doğrulanmış olma koşulu.
CREATE OR REPLACE FUNCTION public.referral_counted(p_user_id uuid)
RETURNS TABLE (invitee_id uuid, subscribed boolean)
AS $BODY$
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
      AND public.account_verified(p.id)
  ) r
  ORDER BY r.is_sub DESC, r.created_at ASC
  LIMIT 3;
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

-- --- 4) Doğrulanmamış hesabın kotası ----------------------------------------

-- Sıfır vermiyoruz. E-posta gecikirse ya da spam klasörüne düşerse öğrenci
-- ürünü hiç göremeden ayrılırdı. Tadımlık hak ürünü denemeye yetiyor,
-- sömürüye yetmiyor.
CREATE OR REPLACE FUNCTION public.unverified_allowance()
RETURNS integer AS $BODY$ SELECT 2; $BODY$ LANGUAGE sql IMMUTABLE;

-- 20260904000000 (canlı) ile aynı premium/ücretsiz kotlar (400 / 6).
-- Tek ek: doğrulanmamış hesap tadımlık 2/gün + davet çarpanı kapalı.
-- Not: subscription_billing (plans.monthly_allowance / Sigma) bu sprintte
-- uygulanmıyor; o gelince credit_reserve oradan güncellenir. Burada 400'e
-- sabitlemek canlıyı ezmez — canlı zaten 400.
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
  v_verified boolean;
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

    -- Doğrulama kontrolü kota yenilemesini düşürmesin.
    BEGIN
      v_verified := public.account_verified(p_user_id);
    EXCEPTION WHEN OTHERS THEN
      v_verified := true;
    END;

    IF v_premium THEN
      -- Ödeme yapmış kullanıcıya doğrulama sorulmuyor: parası zaten
      -- kimliğinin en güçlü kanıtı. Kota = canlı referral_rewards (400).
      v_allowance := 400;
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

    -- Davet çarpanı yalnızca doğrulanmış (veya premium) hesaba.
    IF v_premium OR COALESCE(v_verified, true) THEN
      BEGIN
        v_mult := public.referral_multiplier(p_user_id);
      EXCEPTION WHEN OTHERS THEN
        v_mult := 1;
      END;
      v_allowance := LEAST(v_allowance * GREATEST(COALESCE(v_mult, 1), 1), 100000);
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
