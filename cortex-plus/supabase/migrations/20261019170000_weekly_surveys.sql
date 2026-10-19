-- Haftalık kısa anket (19 Ekim 2026, satışa hazırlık Faz 5, kapalı beta; ürün sahibinin kararı:
-- "Uygulama içi haftalık kısa anket"). Öğrenci haftada en çok bir kez, o hafta çalıştıysa görür:
-- dört soru (yardım 1-5, önerme 0-10, en çok kullanılan, tek cümle öneri). Cevaplar /admin/anket'te.
--
-- Hafta anahtarı İstanbul saatiyle ISO hafta ('2026-W43'). "Şimdi değil" de satır yazar
-- (dismissed = true): aynı hafta yeniden sorulmaz.
--
-- Yazma ve okuma yalnız sunucudan (service_role); satır güvenliği açık, politika yok.
-- Hesap silinince `purgeUserData` satırları siler.
--
-- Yalnız ekleme: yeni tablo, yeni özellik anahtarı.

CREATE TABLE IF NOT EXISTS public.weekly_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_key text NOT NULL CHECK (week_key ~ '^[0-9]{4}-W[0-9]{2}$'),
  dismissed boolean NOT NULL DEFAULT false,
  helpfulness smallint CHECK (helpfulness BETWEEN 1 AND 5),
  recommend smallint CHECK (recommend BETWEEN 0 AND 10),
  most_used text CHECK (most_used IN ('lesson', 'quiz', 'podcast', 'cards', 'chat', 'video', 'written_exam', 'other')),
  improve text CHECK (improve IS NULL OR char_length(improve) <= 600),
  segment text CHECK (segment IN ('free', 'plus', 'sigma', 'beta')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_key),
  CHECK (dismissed OR (helpfulness IS NOT NULL AND recommend IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS weekly_surveys_week_idx ON public.weekly_surveys (week_key, created_at DESC);

ALTER TABLE public.weekly_surveys ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.weekly_surveys IS
  'Haftalık kısa anket (kapalı beta). Kullanıcı ve hafta başına bir satır; dismissed = "Şimdi değil".';

-- Yönetim panelinden kapatılabilsin (Özellik anahtarları). Varsayılan açık.
INSERT INTO public.feature_flags (key, enabled, description)
VALUES ('weekly_survey', true, 'Haftalık kısa anket: o hafta çalışan öğrenciye Sınavlar sayfasında haftada bir kez dört soru.')
ON CONFLICT (key) DO NOTHING;
