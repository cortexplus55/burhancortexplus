-- Classroom detail: discussion + shared exam preps

ALTER TABLE public.exam_preps
  ADD COLUMN IF NOT EXISTS classroom_id uuid REFERENCES public.classrooms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS exam_preps_classroom_idx
  ON public.exam_preps (classroom_id)
  WHERE classroom_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.classroom_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classroom_posts_room_idx
  ON public.classroom_posts (classroom_id, created_at DESC);

ALTER TABLE public.classroom_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS classroom_posts_members ON public.classroom_posts;
CREATE POLICY classroom_posts_members ON public.classroom_posts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.classroom_members m
      WHERE m.classroom_id = classroom_posts.classroom_id
        AND m.student_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_posts.classroom_id
        AND c.teacher_id = auth.uid()
    )
    OR public.is_admin(auth.uid())
  );
