-- Öğrenci AI öğretmen tercihi (kayıt sihirbazı + profil)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tutor_style text NOT NULL DEFAULT 'step_by_step';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tutor_style_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tutor_style_check
  CHECK (tutor_style IN ('step_by_step', 'hints_first', 'direct_solve'));
