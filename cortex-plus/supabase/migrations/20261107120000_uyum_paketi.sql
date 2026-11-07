-- Uyum paketi (7 Kasım 2026): onay kanıtı ve çerez tercihi kaydı. Yalnız ekleme; var olan satıra dokunmaz.
--
-- 1) consent_records.evidence: öğrencinin metni gerçekten açıp sonuna kadar kaydırdığının izi
--    ({ openedAt, confirmedAt, scrolledToEnd, version }) ya da yaş beyanı ({ minor, guardianAck }).
--    Eski satırlarda boş kalır. Kod sütun yoksa sütunsuz yazar (missingColumn).
-- 2) cookie_consent_events: çerez tercihinin kaydı (kabul / ret / özel seçim). Giriş yapmamış ziyaretçide
--    user_id boş; kimlik yalnız tarayıcıda üretilen tercih kimliği (consent_id). IP ham tutulmaz, tek yönlü
--    özetlenir. Hesap silinince satırlar gider (account-deletion.ts), profil silinirse kullanıcı bağı düşer.
--
-- Tarayıcıdan yazma yok: iki tabloya da yalnız sunucu anahtarı (service_role) yazar (6 Kasım güvenlik
-- paketi: yeni tablolar kapalı doğar; aşağıdaki REVOKE aynı şeyi açıkça söyler).

ALTER TABLE public.consent_records ADD COLUMN IF NOT EXISTS evidence jsonb;

CREATE INDEX IF NOT EXISTS consent_records_user_type_version_idx
  ON public.consent_records (user_id, consent_type, version);

CREATE TABLE IF NOT EXISTS public.cookie_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id uuid NOT NULL,
  user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  policy_version text NOT NULL,
  analytics boolean NOT NULL,
  action text NOT NULL CHECK (action IN ('accept_all', 'reject_all', 'custom')),
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cookie_consent_events_user_idx
  ON public.cookie_consent_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cookie_consent_events_consent_idx
  ON public.cookie_consent_events (consent_id, created_at DESC);

ALTER TABLE public.cookie_consent_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cookie_consent_events FROM anon, authenticated;
GRANT ALL ON public.cookie_consent_events TO service_role;
