-- Stage 6: real learning tracking (additive). Progress ≠ mastery ≠ readiness.

ALTER TABLE public.exam_prep_node_attempts
  ADD COLUMN IF NOT EXISTS attempt_ordinal integer NOT NULL DEFAULT 1;

ALTER TABLE public.exam_prep_node_attempts
  ADD COLUMN IF NOT EXISTS answer_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.exam_prep_node_attempts.attempt_ordinal IS
  '1 = first attempt on this node for the user; >1 = retry';
COMMENT ON COLUMN public.exam_prep_node_attempts.answer_meta IS
  'Hint usage and Stage 6 attempt metadata (not student answer content)';

ALTER TABLE public.exam_preps
  ADD COLUMN IF NOT EXISTS learning_tracking jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.exam_preps.learning_tracking IS
  'Stage 6 snapshot: programProgressPct, topicMasteryPct, examReadinessPct (separate)';

CREATE TABLE IF NOT EXISTS public.exam_prep_answer_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps (id) ON DELETE CASCADE,
  node_id uuid REFERENCES public.exam_prep_nodes (id) ON DELETE SET NULL,
  attempt_id uuid REFERENCES public.exam_prep_node_attempts (id) ON DELETE SET NULL,
  topic_key text NOT NULL,
  learning_objective text,
  question_index integer NOT NULL DEFAULT 0,
  correct boolean NOT NULL,
  is_first_attempt boolean NOT NULL DEFAULT true,
  hint_assisted boolean NOT NULL DEFAULT false,
  independent_success boolean NOT NULL DEFAULT false,
  wrong_type text,
  source_kind text NOT NULL DEFAULT 'quiz',
  question_preview text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_prep_answer_evidence_prep_idx
  ON public.exam_prep_answer_evidence (user_id, exam_prep_id, created_at DESC);

CREATE INDEX IF NOT EXISTS exam_prep_answer_evidence_topic_idx
  ON public.exam_prep_answer_evidence (exam_prep_id, topic_key);

CREATE TABLE IF NOT EXISTS public.exam_prep_topic_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps (id) ON DELETE CASCADE,
  topic_key text NOT NULL,
  measured_level text NOT NULL DEFAULT 'unmeasured'
    CHECK (measured_level IN ('unmeasured', 'weak', 'emerging', 'solid')),
  confidence integer NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  evidence_count integer NOT NULL DEFAULT 0,
  first_attempt_correct integer NOT NULL DEFAULT 0,
  first_attempt_total integer NOT NULL DEFAULT 0,
  independent_correct integer NOT NULL DEFAULT 0,
  independent_total integer NOT NULL DEFAULT 0,
  last_practiced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exam_prep_id, topic_key)
);

CREATE INDEX IF NOT EXISTS exam_prep_topic_mastery_prep_idx
  ON public.exam_prep_topic_mastery (user_id, exam_prep_id);

ALTER TABLE public.exam_prep_answer_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_prep_topic_mastery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_prep_answer_evidence_select_own ON public.exam_prep_answer_evidence;
CREATE POLICY exam_prep_answer_evidence_select_own
  ON public.exam_prep_answer_evidence
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS exam_prep_topic_mastery_select_own ON public.exam_prep_topic_mastery;
CREATE POLICY exam_prep_topic_mastery_select_own
  ON public.exam_prep_topic_mastery
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.exam_prep_answer_evidence IS
  'Stage 6 per-answer evidence bound to topic + objective (first/retry, hint-assisted)';
COMMENT ON TABLE public.exam_prep_topic_mastery IS
  'Stage 6 topic mastery from measured evidence only; unmeasured confidence stays 0';
