-- Rol ayrımı: öğrenci / veli / okul öğretmeni + veli-öğrenci bağlantısı

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('student','parent','teacher','verified_teacher','admin'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS primary_role text NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS school_name text,
  ADD COLUMN IF NOT EXISTS focus_subject text,
  ADD COLUMN IF NOT EXISTS invite_code text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_primary_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_primary_role_check
  CHECK (primary_role IN ('student','parent','teacher','verified_teacher','admin'));

CREATE UNIQUE INDEX IF NOT EXISTS profiles_invite_code_key
  ON public.profiles (invite_code) WHERE invite_code IS NOT NULL;

-- Okunabilir davet kodu (karışan karakterler hariç)
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS text AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE invite_code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

-- Yalnızca trigger içinden kullanılır; REST API'ye açılmasın.
REVOKE ALL ON FUNCTION public.generate_invite_code() FROM PUBLIC, anon, authenticated;

UPDATE public.profiles
SET invite_code = public.generate_invite_code()
WHERE invite_code IS NULL;

CREATE TABLE IF NOT EXISTS public.parent_student_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  invite_email text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  CONSTRAINT parent_student_links_target_check
    CHECK (student_id IS NOT NULL OR invite_email IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS parent_student_links_pair_key
  ON public.parent_student_links (parent_id, student_id)
  WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS parent_student_links_student_idx
  ON public.parent_student_links (student_id);

ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS psl_parent_manage ON public.parent_student_links;
CREATE POLICY psl_parent_manage ON public.parent_student_links
  FOR ALL USING (parent_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS psl_student_read ON public.parent_student_links;
CREATE POLICY psl_student_read ON public.parent_student_links
  FOR SELECT USING (student_id = auth.uid());

DROP POLICY IF EXISTS psl_student_respond ON public.parent_student_links;
CREATE POLICY psl_student_respond ON public.parent_student_links
  FOR UPDATE USING (student_id = auth.uid());

-- Veli ↔ öğrenci birbirinin adını görebilir (bekleyen istek dahil)
CREATE OR REPLACE FUNCTION public.profile_link_exists(p_viewer uuid, p_target uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_student_links l
    WHERE l.status IN ('pending','active')
      AND (
        (l.parent_id = p_viewer AND l.student_id = p_target)
        OR (l.student_id = p_viewer AND l.parent_id = p_target)
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (
  id = auth.uid()
  OR public.is_admin(auth.uid())
  OR public.profile_link_exists(auth.uid(), id)
);

-- Kayıt sihirbazından gelen rol ve onboarding verisini uygula
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_role text := COALESCE(NULLIF(v_meta->>'primary_role', ''), 'student');
  v_goal text := NULLIF(v_meta->>'learning_goal', '');
BEGIN
  IF v_role NOT IN ('student','parent','teacher') THEN
    v_role := 'student';
  END IF;

  INSERT INTO public.profiles (
    id, full_name, grade_level, school_name, focus_subject,
    primary_role, invite_code, onboarding_completed_at
  )
  VALUES (
    NEW.id,
    COALESCE(v_meta->>'full_name', ''),
    NULLIF(v_meta->>'grade_level', ''),
    NULLIF(v_meta->>'school_name', ''),
    NULLIF(v_meta->>'focus_subject', ''),
    v_role,
    public.generate_invite_code(),
    CASE WHEN v_meta->>'onboarding_done' = 'true' THEN now() ELSE NULL END
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role);
  INSERT INTO public.credit_wallets (user_id) VALUES (NEW.id);

  IF v_goal IS NOT NULL THEN
    INSERT INTO public.learning_goals (user_id, goal_text) VALUES (NEW.id, v_goal);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
