-- Diagnostic intro quiz before the activity path (video: 5 questions, multi-select).

ALTER TABLE public.exam_preps
  ADD COLUMN IF NOT EXISTS intro_completed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.exam_prep_intro_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.exam_prep_topics(id) ON DELETE SET NULL,
  payload jsonb,
  score integer,
  total integer,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_prep_intro_attempts_prep_idx
  ON public.exam_prep_intro_attempts (exam_prep_id, created_at DESC);

ALTER TABLE public.exam_prep_intro_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_prep_intro_attempts_own ON public.exam_prep_intro_attempts;
CREATE POLICY exam_prep_intro_attempts_own ON public.exam_prep_intro_attempts
  FOR ALL USING (user_id = auth.uid());
