-- Kayıt anında seçilen anlatım stilini profile yaz.
-- Profil tamamlanmasını completeSignup / kayıt sonrası sayfalara bırak (erken sohbet varsayılan stili kullanmasın).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_role text := COALESCE(NULLIF(v_meta->>'primary_role', ''), 'student');
  v_goal text := NULLIF(v_meta->>'learning_goal', '');
  v_relation text := NULLIF(v_meta->>'parent_relation', '');
  v_phone text := NULLIF(v_meta->>'phone', '');
  v_tutor_style text := COALESCE(NULLIF(v_meta->>'tutor_style', ''), 'step_by_step');
BEGIN
  IF v_role NOT IN ('student','parent','teacher') THEN
    v_role := 'student';
  END IF;

  IF v_relation IS NOT NULL AND v_relation NOT IN ('anne','baba','vasi','diger') THEN
    v_relation := NULL;
  END IF;

  IF v_tutor_style NOT IN ('step_by_step','hints_first','direct_solve') THEN
    v_tutor_style := 'step_by_step';
  END IF;

  INSERT INTO public.profiles (
    id, full_name, grade_level, school_name, focus_subject,
    primary_role, invite_code, onboarding_completed_at,
    parent_relation, phone, tutor_style
  )
  VALUES (
    NEW.id,
    COALESCE(v_meta->>'full_name', ''),
    NULLIF(v_meta->>'grade_level', ''),
    NULLIF(v_meta->>'school_name', ''),
    NULLIF(v_meta->>'focus_subject', ''),
    v_role,
    public.generate_invite_code(),
    NULL,
    CASE WHEN v_role = 'parent' THEN v_relation ELSE NULL END,
    CASE WHEN v_role = 'parent' THEN v_phone ELSE NULL END,
    v_tutor_style
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role);
  INSERT INTO public.credit_wallets (user_id) VALUES (NEW.id);

  IF v_goal IS NOT NULL THEN
    INSERT INTO public.learning_goals (user_id, goal_text) VALUES (NEW.id, v_goal);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

UPDATE public.profiles AS p
SET tutor_style = u.meta_style
FROM (
  SELECT
    id,
    raw_user_meta_data->>'tutor_style' AS meta_style
  FROM auth.users
) AS u
WHERE p.id = u.id
  AND p.tutor_style = 'step_by_step'
  AND u.meta_style IN ('hints_first', 'direct_solve');
