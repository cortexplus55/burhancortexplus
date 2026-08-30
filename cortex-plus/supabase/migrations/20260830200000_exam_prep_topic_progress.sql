ALTER TABLE public.exam_prep_topics
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES public.exam_prep_lessons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.exam_prep_topics
  DROP CONSTRAINT IF EXISTS exam_prep_topics_status_check;

ALTER TABLE public.exam_prep_topics
  ADD CONSTRAINT exam_prep_topics_status_check
  CHECK (status IN ('ready', 'in_progress', 'done'));

ALTER TABLE public.exam_prep_lessons
  ADD COLUMN IF NOT EXISTS topic_id uuid REFERENCES public.exam_prep_topics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS exam_prep_lessons_topic_idx
  ON public.exam_prep_lessons (topic_id);
