-- Öğrenme tercihleri (1 Ekim 2026). Astra'nın Ayarlar > Öğrenme tercihleri
-- sekmesindeki dört ayar: günlük çalışma hedefi, önerilen sorular, disleksi
-- dostu okuma, öğretmen sesi.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_suggestions boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS readable_font boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tutor_voice text NOT NULL DEFAULT 'female';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tutor_voice_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tutor_voice_check CHECK (tutor_voice IN ('female', 'male'));

-- Günlük hedef artık dakika ("Bugün 12 / 30 dk"). Eskiden 1–30 arası ve
-- sohbette "soru sayısı" diye okunuyordu; varsayılan 3 dakika anlamsız kalır.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_daily_goal_minutes_check;
UPDATE public.profiles SET daily_goal_minutes = 30 WHERE daily_goal_minutes < 5;
ALTER TABLE public.profiles ALTER COLUMN daily_goal_minutes SET DEFAULT 30;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_daily_goal_minutes_range;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_daily_goal_minutes_range CHECK (daily_goal_minutes BETWEEN 5 AND 240);
