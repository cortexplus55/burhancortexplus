ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key
  ON public.profiles (referral_code)
  WHERE referral_code IS NOT NULL;

ALTER TABLE public.exam_preps
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS study_plan_id uuid REFERENCES public.study_plans(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.phone_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  file_name text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_upload_sessions_user_idx
  ON public.phone_upload_sessions (user_id, created_at DESC);

ALTER TABLE public.phone_upload_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS phone_upload_own ON public.phone_upload_sessions;
CREATE POLICY phone_upload_own ON public.phone_upload_sessions
  FOR ALL USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS class_member_read ON public.classrooms;
CREATE POLICY class_member_read ON public.classrooms
  FOR SELECT USING (
    teacher_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.classroom_members m
      WHERE m.classroom_id = classrooms.id AND m.student_id = auth.uid()
    )
  );
