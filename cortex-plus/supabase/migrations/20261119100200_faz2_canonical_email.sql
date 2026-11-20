-- Faz 2 (madde 4): kanonik e-posta — aynı posta kutusunun başka yazımıyla ikinci (ücretsiz) hesap açılamaz.
--
-- Kök neden (B02): takma ad kalkanı yalnız `/api/auth/signup` içindeydi. Supabase'in herkese açık kayıt ucu
-- (`/auth/v1/signup`, tarayıcıya giden yayımlanabilir anahtarla) ve Google ile ilk giriş bu kontrolden geçmiyordu:
-- `ad+1@…`, `a.d@gmail.com` gibi yazımlarla tek kutudan sınırsız hesap açılıyordu.
--
-- Çözüm veritabanında, bütün kayıt yollarının ortak noktasında: yeni kullanıcının profil satırı (auth tetikleyicisi
-- `handle_new_user` açar) kanonik adresi taşır ve bu adres tekil indeksle korunur. Aynı kutunun ikinci hesabı profil
-- satırını açamaz, kayıt işlemi bütünüyle geri alınır (auth.users satırı da oluşmaz).
--
-- Kural `public.normalize_email(text)` (var olan fonksiyon; TS eşi `src/lib/auth/canonical-email.ts`):
-- küçük harf + boşluksuz, `+` sonrası atılır, gmail.com/googlemail.com'da noktalar atılır ve alan gmail.com olur.
--
-- Ekleyici, tekrar çalıştırılabilir, hiçbir satır silinmez:
--   * Var olan kopyalar (aynı kutudan birden çok eski hesap) BOZULMAZ: kanonik adres yalnız her kutunun EN ESKİ
--     hesabına yazılır, diğerlerinde NULL kalır (tekil indeks yalnız dolu satırlara bakar). Hiçbir hesap kapanmaz.
--   * Tarayıcı (anon/authenticated) kanonik adresi değiştiremez: kendi satırında NULL'a çekip ikinci hesaba yer
--     açamaz.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS canonical_email text;

COMMENT ON COLUMN public.profiles.canonical_email IS
  'Faz 2: public.normalize_email(auth.users.email). Tekil (dolu satırlarda). Eski kopya hesaplarda NULL kalır.';

-- Geri doldurma: her kanonik adresin en eski hesabı (oluşturma anı, sonra kimlik). Başka bir satırda zaten varsa yazılmaz.
WITH ranked AS (
  SELECT
    u.id,
    public.normalize_email(u.email) AS canonical,
    row_number() OVER (PARTITION BY public.normalize_email(u.email) ORDER BY u.created_at ASC NULLS LAST, u.id ASC) AS rn
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE u.email IS NOT NULL AND btrim(u.email) <> ''
)
UPDATE public.profiles p
SET canonical_email = r.canonical
FROM ranked r
WHERE p.id = r.id
  AND r.rn = 1
  AND p.canonical_email IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles q WHERE q.canonical_email = r.canonical);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_canonical_email_key
  ON public.profiles (canonical_email)
  WHERE canonical_email IS NOT NULL;

-- Yeni profil: kanonik adres auth.users'tan hesaplanır (istemcinin yolladığı değer yok sayılır). Aynı kutunun başka bir
-- hesabı varsa anlaşılır bir hata ile durur; kayıt işlemi (auth.users dahil) geri alınır.
-- Güncelleme: tarayıcı kanonik adresi değiştiremez (sunucu anahtarı ve SQL fonksiyonları değiştirebilir).
CREATE OR REPLACE FUNCTION public.profiles_canonical_email_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_email text;
  v_canonical text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Upsert'in (INSERT … ON CONFLICT (id) DO UPDATE) INSERT denemesi: satır zaten var, işlem güncellemeye döner.
    -- Var olan hesabın kanonik adresi korunur; eski kopya hesap (NULL) kendi profilini yine güncelleyebilir.
    IF EXISTS (SELECT 1 FROM public.profiles q WHERE q.id = NEW.id) THEN
      SELECT q.canonical_email INTO NEW.canonical_email FROM public.profiles q WHERE q.id = NEW.id;
      RETURN NEW;
    END IF;
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = NEW.id;
    IF v_email IS NULL OR btrim(v_email) = '' THEN
      NEW.canonical_email := NULL;
      RETURN NEW;
    END IF;
    v_canonical := public.normalize_email(v_email);
    IF EXISTS (SELECT 1 FROM public.profiles q WHERE q.canonical_email = v_canonical AND q.id <> NEW.id) THEN
      RAISE EXCEPTION 'email_alias_taken'
        USING ERRCODE = '23505',
              DETAIL = 'Bu e-posta adresiyle ilişkili bir hesabın zaten bulunuyor, lütfen giriş yap.';
    END IF;
    NEW.canonical_email := v_canonical;
    RETURN NEW;
  END IF;

  -- UPDATE. SECURITY DEFINER içinde current_user fonksiyonun sahibidir; isteği yapanın rolü JWT iddiasından okunur
  -- (PostgREST her istekte yazar). Tarayıcı rolleri (anon, authenticated) kanonik adresi değiştiremez.
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    NEW.canonical_email := OLD.canonical_email;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_canonical_email_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS profiles_canonical_email_guard ON public.profiles;
CREATE TRIGGER profiles_canonical_email_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_canonical_email_guard();
