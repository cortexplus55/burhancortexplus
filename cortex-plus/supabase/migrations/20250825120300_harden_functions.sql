-- Pin search_path so a hostile role cannot shadow referenced objects.
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_admin(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.has_role(uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.credit_reserve(uuid, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.credit_commit(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.credit_refund(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.match_document_chunks(uuid, vector, integer) SET search_path = public, pg_temp;

-- These functions take a user id as a parameter, so exposing them through
-- PostgREST would let any client act on another user's wallet or documents.
-- Only the server-side service role may call them.
REVOKE ALL ON FUNCTION public.credit_reserve(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_commit(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_refund(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_document_chunks(uuid, vector, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.credit_reserve(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_commit(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_refund(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(uuid, vector, integer) TO service_role;

-- is_admin/has_role stay callable because RLS policies evaluate them as the
-- querying role; they only return a boolean about role membership.
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, service_role;
