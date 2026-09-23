-- Keep old access tokens from accessing data after a deletion request starts.
-- SECURITY DEFINER is confined to the caller's own account, without a user-id
-- parameter, so profiles' own restrictive policy does not recurse.
CREATE OR REPLACE FUNCTION public.current_account_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NOT NULL
  );
$$;
REVOKE ALL ON FUNCTION public.current_account_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_account_active() TO authenticated, service_role;

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT n.nspname, c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS active_account_required ON %I.%I', t.nspname,t.relname);
    EXECUTE format('CREATE POLICY active_account_required ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.current_account_active())) WITH CHECK ((SELECT public.current_account_active()))', t.nspname,t.relname);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS active_account_required ON storage.objects;
CREATE POLICY active_account_required ON storage.objects AS RESTRICTIVE
FOR ALL TO authenticated
USING ((SELECT public.current_account_active()))
WITH CHECK ((SELECT public.current_account_active()));
