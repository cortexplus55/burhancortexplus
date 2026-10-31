-- 31 Ekim 2026 (Paket J1 #1, ürün sahibinin kararı): "Hemen gir, içeride onayla".
--
-- E-posta ve şifreyle kayıt artık sunucuda açılıyor (`/api/auth/signup`, Supabase yönetici ucu,
-- `email_confirm: true`): öğrenci doğrulama ekranında beklemeden içeri girer. Bu yolda `email_confirmed_at`
-- hemen dolar; doğrulanmamışlığı `app_metadata.email_unverified = true` taşır ve doğrulama bağlantısı (bizim posta
-- hattımız, 7 gün) bayrağı kaldırır. Bu fonksiyon bayrağı görünce hesabı doğrulanmamış sayar: davet hediyesi
-- (`grant_referral_gift`) ve davet sayımı (`referral_counted`) yalnız doğrulanınca. Google ile gelen hesapta bayrak
-- yok (sağlayıcı e-postayı doğruladı); doğrulanmamış hesaba Google ile girilince bayrak kalkar (auth/callback).
--
-- Gövde 20260905170000'dakinin aynısı; tek ek: bayrak satırı. Eklemeli: aynı imza, DROP yok.

CREATE OR REPLACE FUNCTION public.account_verified(p_user_id uuid)
RETURNS boolean AS $BODY$
DECLARE
  v_confirmed timestamptz;
  v_email text;
  v_domain text;
  v_unverified boolean;
BEGIN
  IF public.account_grandfathered(p_user_id) THEN
    RETURN true;
  END IF;

  SELECT u.email_confirmed_at, lower(u.email),
         COALESCE((u.raw_app_meta_data ->> 'email_unverified')::boolean, false)
    INTO v_confirmed, v_email, v_unverified
    FROM auth.users u WHERE u.id = p_user_id;

  IF v_confirmed IS NULL OR v_unverified THEN
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

ALTER FUNCTION public.account_verified(uuid) SET search_path = public, pg_temp;
