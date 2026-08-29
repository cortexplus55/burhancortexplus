-- Plus profile parity (Astra ayarlar overlay)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_goal_minutes integer NOT NULL DEFAULT 3 CHECK (daily_goal_minutes BETWEEN 1 AND 30),
  ADD COLUMN IF NOT EXISTS learning_role text NOT NULL DEFAULT 'student';

-- Exam prep deep flow (topics, lessons, sessions)

CREATE TABLE IF NOT EXISTS public.exam_prep_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_prep_topics_prep_idx
  ON public.exam_prep_topics (exam_prep_id, sort_order);

CREATE TABLE IF NOT EXISTS public.exam_prep_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  title text NOT NULL,
  content_md text,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exam_prep_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  lesson_id uuid REFERENCES public.exam_prep_lessons(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.practice_exams
  ADD COLUMN IF NOT EXISTS exam_prep_id uuid REFERENCES public.exam_preps(id) ON DELETE SET NULL;

ALTER TABLE public.exam_prep_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_prep_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_prep_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY exam_prep_topics_own ON public.exam_prep_topics
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.exam_preps p
      WHERE p.id = exam_prep_topics.exam_prep_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY exam_prep_lessons_own ON public.exam_prep_lessons
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.exam_preps p
      WHERE p.id = exam_prep_lessons.exam_prep_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY exam_prep_sessions_own ON public.exam_prep_sessions
  FOR ALL USING (user_id = auth.uid());
