-- Davet ödülünde yalnızca süresi devam eden premium abonelik sayılsın.
-- Cron günde bir kez çalıştığı için bitiş ile status güncellemesi arasında
-- birkaç saatlik pencere olabilir; hak kararı cron zamanına bağlı kalmamalı.

CREATE OR REPLACE FUNCTION public.referral_counted(p_user_id uuid)
RETURNS TABLE (invitee_id uuid, subscribed boolean)
AS $BODY$
  SELECT r.id, r.is_sub
  FROM (
    SELECT p.id,
           p.created_at,
           EXISTS (
             SELECT 1
             FROM public.subscriptions s
             JOIN public.plans pl ON pl.id = s.plan_id
             WHERE s.user_id = p.id
               AND s.status = 'active'
               AND pl.is_premium
               AND (s.current_period_end IS NULL OR s.current_period_end > now())
           ) AS is_sub
    FROM public.profiles p
    WHERE p.referred_by = p_user_id
      AND public.account_verified(p.id)
  ) r
  ORDER BY r.is_sub DESC, r.created_at ASC
  LIMIT 3;
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.referral_counted(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.referral_counted(uuid) TO authenticated, service_role;
