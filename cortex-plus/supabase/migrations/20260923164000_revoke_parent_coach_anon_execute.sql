-- Parent coach UI is retired; spend/refund must not be callable via PostgREST.
REVOKE ALL ON FUNCTION public.parent_coach_spend(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parent_coach_refund(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parent_coach_spend(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.parent_coach_refund(uuid, text) TO service_role;
