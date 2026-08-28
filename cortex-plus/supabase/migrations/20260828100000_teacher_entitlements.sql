-- Teacher usage counters (pending trial limits) + assignment quiz link

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS quiz_id uuid REFERENCES public.quizzes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.teacher_usage (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  assignments_created integer NOT NULL DEFAULT 0 CHECK (assignments_created >= 0),
  quizzes_generated integer NOT NULL DEFAULT 0 CHECK (quizzes_generated >= 0),
  reports_viewed integer NOT NULL DEFAULT 0 CHECK (reports_viewed >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY teacher_usage_own ON public.teacher_usage
  FOR ALL
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_active_per_user
  ON public.subscriptions (user_id)
  WHERE status = 'active';
