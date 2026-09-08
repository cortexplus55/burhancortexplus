-- Stage 4: store schedule fit + session metadata (additive).
ALTER TABLE public.exam_preps
  ADD COLUMN IF NOT EXISTS schedule_v2 jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.exam_prep_nodes
  ADD COLUMN IF NOT EXISTS session_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.exam_preps.schedule_v2 IS
  'pdf_learning_v2 Stage 4 schedule summary: fits, cuts, options, study days';
COMMENT ON COLUMN public.exam_prep_nodes.session_meta IS
  'Stage 4 session: topic, objective, pages, duration, role, calendarDate';
