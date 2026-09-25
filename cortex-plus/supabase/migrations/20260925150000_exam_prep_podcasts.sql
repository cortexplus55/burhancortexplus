-- Önbellek: aynı hazırlık + konu + süre ikinci kez üretilmez ve kredi yazılmaz.
-- Sahip bu SQL'i Supabase SQL editöründe çalıştırır.

CREATE TABLE IF NOT EXISTS public.exam_prep_podcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic_key text NOT NULL,
  topic_label text NOT NULL,
  length text NOT NULL CHECK (length IN ('ozet', 'standart', 'derin')),
  title text NOT NULL,
  chapters jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_prep_podcasts_prep_topic_length UNIQUE (exam_prep_id, topic_key, length)
);

ALTER TABLE public.exam_prep_podcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_prep_podcasts_own ON public.exam_prep_podcasts;
CREATE POLICY exam_prep_podcasts_own ON public.exam_prep_podcasts
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
