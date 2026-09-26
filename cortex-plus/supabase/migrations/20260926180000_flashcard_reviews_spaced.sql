-- Aralıklı tekrar: card_key tabanlı flashcard_reviews.
-- Eski şema (flashcard_id FK) uygulama tarafından hiç yazılmadı; DROP + CREATE.
-- Canlıya agent uygulamayacak — PR'da SQL Editor adımları.

DROP POLICY IF EXISTS flashcard_reviews_own ON public.flashcard_reviews;
DROP TABLE IF EXISTS public.flashcard_reviews;

CREATE TABLE public.flashcard_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exam_prep_id uuid REFERENCES public.exam_preps(id) ON DELETE SET NULL,
  card_key text NOT NULL,
  card_source text NOT NULL
    CHECK (card_source IN ('node', 'studio', 'mistake', 'misconception')),
  topic_label text,
  ease numeric NOT NULL DEFAULT 2.5,
  interval_days numeric NOT NULL DEFAULT 0,
  reps integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL DEFAULT now(),
  last_rating text
    CHECK (last_rating IS NULL OR last_rating IN ('missed', 'hard', 'knew')),
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, card_key)
);

CREATE INDEX flashcard_reviews_user_due_idx
  ON public.flashcard_reviews (user_id, due_at);

CREATE INDEX flashcard_reviews_user_prep_idx
  ON public.flashcard_reviews (user_id, exam_prep_id)
  WHERE exam_prep_id IS NOT NULL;

ALTER TABLE public.flashcard_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY flashcard_reviews_own ON public.flashcard_reviews
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.flashcard_reviews IS
  'Aralıklı tekrar durumu. card_key = kaynak türü + kimlik veya ön yüz özeti.';
COMMENT ON COLUMN public.flashcard_reviews.due_at IS
  'Bir sonraki gösterim zamanı. Bilmedim sonrası ~10 dk.';
