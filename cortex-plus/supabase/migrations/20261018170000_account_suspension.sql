-- ============================================================================
-- Hesabı askıya alma (18 Ekim 2026, satışa hazırlık planı 4.1)
--
-- Silinmiş hesap bariyeri (20260923120002) zaten tek kapıdan geçiyor:
-- `current_account_active()` hem ara katmanda hem bütün tablolardaki
-- RESTRICTIVE ilkede. Askıya alma aynı kapıya eklenir: `profiles.suspended_at`
-- doluysa hesap etkin değildir — açık oturumlar o anda düşer, giriş kapanır,
-- veri olduğu gibi durur (silme değil). Yönetici `/admin/kullanicilar`'dan açar.
--
-- `current_account_status()` giriş ekranına nedeni söyler: askıdaki öğrenci
-- "hesabın askıya alındı" görsün, silinmiş gibi sessizce dışarı düşmesin.
-- CREATE OR REPLACE yetkileri korur. Tamamen additive; DROP yok.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text;

CREATE OR REPLACE FUNCTION public.current_account_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (deleted_at IS NOT NULL OR suspended_at IS NOT NULL)
  );
$$;

CREATE OR REPLACE FUNCTION public.current_account_status()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 'anonymous'
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NOT NULL) THEN 'deleted'
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND suspended_at IS NOT NULL) THEN 'suspended'
    ELSE 'active'
  END;
$$;
REVOKE ALL ON FUNCTION public.current_account_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_account_status() TO authenticated, service_role;
