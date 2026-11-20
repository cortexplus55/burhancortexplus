-- Faz 2 (madde 6): yasal onayların anı profilde.
--
-- Kök neden (B36): KVKK / Kullanım Koşulları / yaş beyanı yalnız arayüzde zorunluydu. Sunucu kayıt ucu onay
-- alanlarını istemiyordu; profilde "ne zaman onayladı" bilgisi yoktu (kanıt yalnız consent_records'ta, kanıtsız
-- yollarda hiç yazılmıyordu). Kayıt ucu artık üç onayı `z.literal(true)` ile ister (400); bu göç anları profile
-- taşır ve bundan sonra her onay kaydında kendiliğinden günceller.
--
-- Ekleyici ve tekrar çalıştırılabilir; satır silinmez, var olan değer ezilmez (yalnız boş alan doldurulur).
--   terms_accepted_at  — Kullanım Koşulları ilk onay anı (consent_type = 'kullanim_kosullari')
--   kvkk_accepted_at   — KVKK Aydınlatma Metni ilk onay anı (consent_type = 'kvkk_aydinlatma')
--   age_confirmed_at   — yaş beyanı ilk anı (consent_type = 'yas_beyani')
-- Tarayıcı (anon/authenticated) bu alanları kendisi yazamaz; yalnız sunucu onay kaydı (consent_records) doldurur.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kvkk_accepted_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age_confirmed_at timestamptz;

COMMENT ON COLUMN public.profiles.terms_accepted_at IS 'Faz 2: Kullanım Koşulları ilk onay anı (consent_records''tan).';
COMMENT ON COLUMN public.profiles.kvkk_accepted_at IS 'Faz 2: KVKK Aydınlatma Metni ilk onay anı (consent_records''tan).';
COMMENT ON COLUMN public.profiles.age_confirmed_at IS 'Faz 2: yaş beyanı ilk anı (consent_records''tan).';

-- Geri doldurma: var olan onay kayıtlarının en erken anı.
WITH firsts AS (
  SELECT
    c.user_id,
    min(c.accepted_at) FILTER (WHERE c.consent_type = 'kullanim_kosullari') AS terms_at,
    min(c.accepted_at) FILTER (WHERE c.consent_type = 'kvkk_aydinlatma') AS kvkk_at,
    min(c.accepted_at) FILTER (WHERE c.consent_type = 'yas_beyani') AS age_at
  FROM public.consent_records c
  GROUP BY c.user_id
)
UPDATE public.profiles p
SET
  terms_accepted_at = coalesce(p.terms_accepted_at, f.terms_at),
  kvkk_accepted_at = coalesce(p.kvkk_accepted_at, f.kvkk_at),
  age_confirmed_at = coalesce(p.age_confirmed_at, f.age_at)
FROM firsts f
WHERE p.id = f.user_id
  AND (
    (p.terms_accepted_at IS NULL AND f.terms_at IS NOT NULL)
    OR (p.kvkk_accepted_at IS NULL AND f.kvkk_at IS NOT NULL)
    OR (p.age_confirmed_at IS NULL AND f.age_at IS NOT NULL)
  );

-- Yeni onay kaydı → profildeki boş an dolar.
CREATE OR REPLACE FUNCTION public.consent_records_stamp_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.consent_type = 'kullanim_kosullari' THEN
    UPDATE public.profiles SET terms_accepted_at = NEW.accepted_at
    WHERE id = NEW.user_id AND terms_accepted_at IS NULL;
  ELSIF NEW.consent_type = 'kvkk_aydinlatma' THEN
    UPDATE public.profiles SET kvkk_accepted_at = NEW.accepted_at
    WHERE id = NEW.user_id AND kvkk_accepted_at IS NULL;
  ELSIF NEW.consent_type = 'yas_beyani' THEN
    UPDATE public.profiles SET age_confirmed_at = NEW.accepted_at
    WHERE id = NEW.user_id AND age_confirmed_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.consent_records_stamp_profile() FROM PUBLIC;

DROP TRIGGER IF EXISTS consent_records_stamp_profile ON public.consent_records;
CREATE TRIGGER consent_records_stamp_profile
  AFTER INSERT ON public.consent_records
  FOR EACH ROW EXECUTE FUNCTION public.consent_records_stamp_profile();

-- Tarayıcı onay anlarını kendisi yazamaz (kendi profil satırında bile): yazım yalnız sunucu yolundan.
CREATE OR REPLACE FUNCTION public.profiles_legal_acceptance_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.terms_accepted_at := NULL;
    NEW.kvkk_accepted_at := NULL;
    NEW.age_confirmed_at := NULL;
    RETURN NEW;
  END IF;
  NEW.terms_accepted_at := OLD.terms_accepted_at;
  NEW.kvkk_accepted_at := OLD.kvkk_accepted_at;
  NEW.age_confirmed_at := OLD.age_confirmed_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_legal_acceptance_guard ON public.profiles;
CREATE TRIGGER profiles_legal_acceptance_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_legal_acceptance_guard();
