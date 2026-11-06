-- İki kademeli yönetim (6 Kasım 2026): `founder` (Kurucu) ve `admin` (Yönetici).
--
-- Yalnız ekleme ve genişletme:
--   * user_roles.role CHECK'ine 'founder' eklenir (eski değerlerin hepsi kalır).
--   * public.is_founder(uid): iptal edilmemiş founder satırı var mı. is_admin kalıbıyla aynı
--     (SECURITY DEFINER, arama yolu sabit, yalnız authenticated ve service_role çalıştırır).
--   * public.is_admin(uid) founder'ı da yönetici sayar. Davranış genişler, daralmaz: credit_reserve ve
--     öteki SQL çağıranları kurucuyu da yönetici görür.
--   * public.admin_user_id_by_email(email): /admin/yoneticiler sayfası e-postadan hesap bulur
--     (auth.users okunur; yalnız service_role). Göç yoksa kod Auth yönetici API'siyle tarar.
--   * Hiç etkin founder yoksa en eski granted_at'li etkin admin satırının sahibine founder satırı eklenir.
--     E-posta yazılmaz; seçim yalnız satırlardan. O kişinin admin satırı da yerinde kalır.
--
-- Tekrar çalıştırılabilir: CHECK düşürülüp genişletilerek yeniden kurulur, fonksiyonlar
-- CREATE OR REPLACE, founder ekleme yalnız etkin founder yokken.

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('student','parent','teacher','verified_teacher','admin','founder'));

CREATE OR REPLACE FUNCTION public.is_founder(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = uid AND ur.role = 'founder' AND ur.revoked_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_founder(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_founder(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = uid AND ur.role IN ('admin', 'founder') AND ur.revoked_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT u.id FROM auth.users u
  WHERE lower(u.email) = lower(btrim(p_email))
  ORDER BY u.created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.admin_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_id_by_email(text) TO service_role;

-- İlk kurucu: etkin founder yoksa en eski etkin yönetici. Aynı kişinin eski (iptal edilmiş) founder
-- satırı varsa yeniden etkinleşir (UNIQUE (user_id, role)).
INSERT INTO public.user_roles (user_id, role, granted_by)
SELECT first_admin.user_id, 'founder', NULL
FROM (
  SELECT ur.user_id
  FROM public.user_roles ur
  WHERE ur.role = 'admin' AND ur.revoked_at IS NULL
  ORDER BY ur.granted_at ASC, ur.id ASC
  LIMIT 1
) AS first_admin
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles f WHERE f.role = 'founder' AND f.revoked_at IS NULL
)
ON CONFLICT (user_id, role) DO UPDATE SET revoked_at = NULL;
