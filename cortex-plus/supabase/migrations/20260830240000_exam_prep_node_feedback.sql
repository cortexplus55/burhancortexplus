-- Cache instructor debrief and student answers on node attempts.

ALTER TABLE public.exam_prep_node_attempts
  ADD COLUMN IF NOT EXISTS answers jsonb,
  ADD COLUMN IF NOT EXISTS feedback jsonb;
