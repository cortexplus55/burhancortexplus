-- Aktif öğrenme süresi (30 Eylül 2026).
--
-- Astra'nın Aktivitelerim sayfası dakika cinsinden öğrenme süresi ve
-- "tüm zamanların tasarrufu" gösteriyor; bizde süre hiç ölçülmüyordu.
-- Yalnızca ders, test ve sohbet ekranında, sekme açıkken ve öğrenci son
-- iki dakikada ekranla ilgilenmişken sayılır. Gün, ekran ve ders başına
-- tek satır; istemci 30 saniyede bir ekler.

CREATE TABLE IF NOT EXISTS public.learning_time (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  surface text NOT NULL CHECK (surface IN ('lesson', 'quiz', 'chat', 'exam')),
  subject text NOT NULL DEFAULT '',
  seconds integer NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activity_date, surface, subject)
);

ALTER TABLE public.learning_time ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_time_own ON public.learning_time;
CREATE POLICY learning_time_own ON public.learning_time
  FOR SELECT USING (user_id = auth.uid());

-- Tek çağrı en fazla 120 saniye ekler; bir gün-ekran-ders satırı 24 saati aşmaz.
CREATE OR REPLACE FUNCTION public.add_learning_time(
  p_user_id uuid,
  p_date date,
  p_surface text,
  p_subject text,
  p_seconds integer
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.learning_time (user_id, activity_date, surface, subject, seconds)
  VALUES (p_user_id, p_date, p_surface, left(coalesce(p_subject, ''), 40), least(greatest(p_seconds, 0), 120))
  ON CONFLICT (user_id, activity_date, surface, subject)
  DO UPDATE SET
    seconds = least(public.learning_time.seconds + excluded.seconds, 86400),
    updated_at = now();
$$;

REVOKE ALL ON FUNCTION public.add_learning_time(uuid, date, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_learning_time(uuid, date, text, text, integer) TO service_role;
