-- 31 Ekim 2026 (lansman zırhı): aynı posta kutusunun yazım farklarıyla açılan hesaplar.
--
-- Gmail noktaları yok sayar ve "+"dan sonrasını atar: ali.veli+1@gmail.com, aliveli@gmail.com ve
-- a.l.i.veli+2@googlemail.com aynı kutudur. Doğrulama e-postası hepsine aynı kutuya geldiği için tek kişi sınırsız
-- ücretsiz hesap açıp her birine bir davet kodu yazarak hesap başına 90 kredilik davet hediyesi toplayabiliyordu.
-- `normalizeEmail` (src/lib/auth/email-policy.ts) yalnız testlerde kullanılıyordu.
--
--   * normalize_email(text): JS'teki normalizeEmail'in aynısı (küçük harf, "+" sonrası atılır, Gmail'de nokta atılır,
--     googlemail.com → gmail.com).
--   * email_alias_taken(text): bu kutunun BAŞKA yazımıyla açılmış hesap var mı (kayıt öncesi uyarı; yalnız
--     service_role, sunucu eylemi hız sınırıyla çağırır). Aynı yazım Supabase'in kendi işi.
--   * grant_referral_gift: davetli ile davet eden aynı kutuysa ya da davetliden önce aynı kutunun başka yazımıyla
--     açılmış bir hesap varsa hediye yok. Geri kalan her satır 20261024121000'deki gibi (90 kredi, davet eden en çok 3).
--
-- Kayıt engellenmez (auth.users'a tetik yok): Google ile girişte Google'ın verdiği yazım ile şifreyle açılmış
-- hesabın yazımı farklı olabilir; tetik o öğrenciyi dışarıda bırakırdı. Ücretsiz sayaçlar hesap başına kalır.
--
-- Eklemeli: yeni fonksiyonlar ve grant_referral_gift'in yeni gövdesi (aynı imza), DROP yok.

CREATE OR REPLACE FUNCTION public.normalize_email(p_email text)
RETURNS text AS $BODY$
  WITH parts AS (
    SELECT
      split_part(split_part(lower(trim(COALESCE(p_email, ''))), '@', 1), '+', 1) AS local,
      split_part(lower(trim(COALESCE(p_email, ''))), '@', 2) AS domain
  )
  SELECT CASE
    WHEN domain IN ('gmail.com', 'googlemail.com') THEN replace(local, '.', '') || '@gmail.com'
    WHEN domain = '' THEN lower(trim(COALESCE(p_email, '')))
    ELSE local || '@' || domain
  END
  FROM parts;
$BODY$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.email_alias_taken(p_email text)
RETURNS boolean AS $BODY$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.email IS NOT NULL
      AND public.normalize_email(u.email) = public.normalize_email(p_email)
      AND lower(u.email) <> lower(trim(COALESCE(p_email, '')))
  );
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.email_alias_taken(text) SET search_path = public, auth, pg_temp;
REVOKE ALL ON FUNCTION public.email_alias_taken(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_alias_taken(text) TO service_role;

CREATE OR REPLACE FUNCTION public.grant_referral_gift(p_user_id uuid)
RETURNS void AS $BODY$
DECLARE
  v_inviter uuid;
  v_gift integer := 90;
  v_verified boolean;
  v_email text;
  v_created timestamptz;
  v_inviter_email text;
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
  -- Aynı posta kutusu (31 Ekim 2026): davetli davet edenin kutusunun başka yazımıysa ya da kutunun daha önce açılmış
  -- başka bir hesabı varsa hediye yok. Kutunun ilk hesabı hediyesini alabilir.
  SELECT u.email, u.created_at INTO v_email, v_created FROM auth.users u WHERE u.id = p_user_id;
  SELECT u.email INTO v_inviter_email FROM auth.users u WHERE u.id = v_inviter;
  IF v_email IS NOT NULL THEN
    IF v_inviter_email IS NOT NULL AND public.normalize_email(v_email) = public.normalize_email(v_inviter_email) THEN
      RETURN;
    END IF;
    IF EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id <> p_user_id
        AND u.email IS NOT NULL
        AND (v_created IS NULL OR u.created_at < v_created)
        AND public.normalize_email(u.email) = public.normalize_email(v_email)
    ) THEN
      RETURN;
    END IF;
  END IF;
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

ALTER FUNCTION public.grant_referral_gift(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.grant_referral_gift(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_referral_gift(uuid) TO service_role;
