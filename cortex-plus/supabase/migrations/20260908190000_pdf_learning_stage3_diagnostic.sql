-- Aşama 3 — Tanı ölçümü (additive). Mevcut prep / intro satırlarına dokunmaz; drop yok.
-- self-report (familiarity / hard_topics_self) ile measured_level ayrı tutulur.

-- ─── Hazırlık profili (intake) ───────────────────────────────────────────────
ALTER TABLE public.exam_preps
  ADD COLUMN IF NOT EXISTS daily_minutes integer;

ALTER TABLE public.exam_preps
  ADD COLUMN IF NOT EXISTS study_days jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.exam_preps
  ADD COLUMN IF NOT EXISTS hard_topics_self jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.exam_preps
  ADD COLUMN IF NOT EXISTS learning_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exam_preps_daily_minutes_check'
  ) THEN
    ALTER TABLE public.exam_preps
      ADD CONSTRAINT exam_preps_daily_minutes_check
      CHECK (daily_minutes IS NULL OR (daily_minutes >= 5 AND daily_minutes <= 480));
  END IF;
END $$;

-- ─── Konu bazlı ölçüm (self-report familiarity kolonundan ayrı) ─────────────
ALTER TABLE public.exam_prep_topics
  ADD COLUMN IF NOT EXISTS document_topic_node_id uuid
    REFERENCES public.document_topic_nodes(id) ON DELETE SET NULL;

ALTER TABLE public.exam_prep_topics
  ADD COLUMN IF NOT EXISTS measured_level text;

ALTER TABLE public.exam_prep_topics
  ADD COLUMN IF NOT EXISTS diagnostic_status text NOT NULL DEFAULT 'unmeasured';

ALTER TABLE public.exam_prep_topics
  ADD COLUMN IF NOT EXISTS diagnostic_evidence jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exam_prep_topics_measured_level_check'
  ) THEN
    ALTER TABLE public.exam_prep_topics
      ADD CONSTRAINT exam_prep_topics_measured_level_check
      CHECK (
        measured_level IS NULL
        OR measured_level IN ('unknown', 'weak', 'emerging', 'solid')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exam_prep_topics_diagnostic_status_check'
  ) THEN
    ALTER TABLE public.exam_prep_topics
      ADD CONSTRAINT exam_prep_topics_diagnostic_status_check
      CHECK (diagnostic_status IN ('unmeasured', 'measured', 'unreadable'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS exam_prep_topics_doc_topic_idx
  ON public.exam_prep_topics (document_topic_node_id)
  WHERE document_topic_node_id IS NOT NULL;

-- ─── Tanı özeti (intro denemesine bağlı; hangi cevaplar seviyeyi belirledi) ──
CREATE TABLE IF NOT EXISTS public.exam_prep_diagnostic_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  intro_attempt_id uuid REFERENCES public.exam_prep_intro_attempts(id) ON DELETE SET NULL,
  starting_level_label text NOT NULL DEFAULT 'Başlangıç düzeyi belirlendi',
  overall_measured text NOT NULL DEFAULT 'unknown'
    CHECK (overall_measured IN ('unknown', 'weak', 'emerging', 'solid')),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  topic_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_prep_id)
);

CREATE INDEX IF NOT EXISTS exam_prep_diagnostic_summaries_user_idx
  ON public.exam_prep_diagnostic_summaries (user_id, created_at DESC);

ALTER TABLE public.exam_prep_diagnostic_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_prep_diagnostic_summaries_own ON public.exam_prep_diagnostic_summaries;
CREATE POLICY exam_prep_diagnostic_summaries_own ON public.exam_prep_diagnostic_summaries
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
