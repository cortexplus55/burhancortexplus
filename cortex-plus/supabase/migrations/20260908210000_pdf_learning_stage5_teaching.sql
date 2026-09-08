-- Stage 5: misconception / wrong-type hooks for Stage 6 (additive).
CREATE TABLE IF NOT EXISTS public.exam_prep_misconceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps (id) ON DELETE CASCADE,
  node_id uuid REFERENCES public.exam_prep_nodes (id) ON DELETE SET NULL,
  attempt_id uuid REFERENCES public.exam_prep_node_attempts (id) ON DELETE SET NULL,
  topic_label text,
  claim text NOT NULL,
  corrected text,
  wrong_type text NOT NULL DEFAULT 'unknown',
  source_kind text NOT NULL DEFAULT 'quiz',
  question_preview text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_prep_misconceptions_user_prep_idx
  ON public.exam_prep_misconceptions (user_id, exam_prep_id, created_at DESC);

CREATE INDEX IF NOT EXISTS exam_prep_misconceptions_type_idx
  ON public.exam_prep_misconceptions (wrong_type);

ALTER TABLE public.exam_prep_misconceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_prep_misconceptions_select_own ON public.exam_prep_misconceptions;
CREATE POLICY exam_prep_misconceptions_select_own
  ON public.exam_prep_misconceptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.exam_prep_misconceptions IS
  'Stage 5 teaching-standard hooks: wrong answers / misconceptions for Stage 6 review';
