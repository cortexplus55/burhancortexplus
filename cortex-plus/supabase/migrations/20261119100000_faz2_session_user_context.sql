-- Faz 2 (madde 2): oturum bağlamı tek RPC.
--
-- Her sayfa ve API açılışında hesap durumu, profil, abonelik + plan, kredi cüzdanı, yönetici rolü, yönetici
-- önizlemesi ve ücretsiz sayaçlar ayrı ayrı (çoğu sıralı) okunuyordu; 50 eşzamanlı kullanıcıda PostgREST bağlantı
-- havuzu doluyordu (PGRST003). Bu fonksiyon hepsini TEK çağrıda döner. Yalnız okur; hiçbir satırı değiştirmez.
--
-- Güvenlik: SECURITY DEFINER, ama yalnız çağıranın kendi satırları döner. Oturumlu kullanıcı yalnız kendi
-- kimliğini (auth.uid()) sorabilir; başka bir kimlik ya da oturumsuz çağrı NULL alır. Sunucu anahtarı
-- (service_role) sunucu işleri için herhangi bir kullanıcıyı okuyabilir. anon ve PUBLIC çalıştıramaz.
--
-- Ekleyici ve tekrar çalıştırılabilir: yalnız yeni bir fonksiyon (CREATE OR REPLACE) ve yetki verilir.

CREATE OR REPLACE FUNCTION public.get_session_user_context(
  p_user_id uuid,
  p_period_keys text[] DEFAULT ARRAY[]::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.role());
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_role IS DISTINCT FROM 'service_role' AND (v_caller IS NULL OR v_caller <> p_user_id) THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    -- public.current_account_active() ile aynı anlam: silinmiş ya da askıdaki profil etkin değildir.
    'active', NOT EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = p_user_id AND (pr.deleted_at IS NOT NULL OR pr.suspended_at IS NOT NULL)
    ),
    'profile', (
      SELECT jsonb_build_object(
        'full_name', pr.full_name,
        'avatar_url', pr.avatar_url,
        'primary_role', pr.primary_role,
        'onboarding_completed_at', pr.onboarding_completed_at,
        'deleted_at', pr.deleted_at,
        'tutor_style', pr.tutor_style,
        'grade_level', pr.grade_level,
        'focus_subject', pr.focus_subject,
        'school_id', pr.school_id,
        'school_name', pr.school_name
      )
      FROM public.profiles pr
      WHERE pr.id = p_user_id
    ),
    'wallet', (
      SELECT jsonb_build_object(
        'balance', w.balance,
        'free_allowance_remaining', w.free_allowance_remaining,
        'period_allowance', w.period_allowance,
        'period_ends_at', w.period_ends_at,
        'period_kind', w.period_kind
      )
      FROM public.credit_wallets w
      WHERE w.user_id = p_user_id
    ),
    -- getUserEntitlements ile aynı süzgeç: etkin ve dönemi geçmemiş abonelik (en geç biten önce).
    'subscription', (
      SELECT jsonb_build_object(
        'status', s.status,
        'current_period_end', s.current_period_end,
        'cancel_at_period_end', s.cancel_at_period_end,
        'plans', (
          SELECT jsonb_build_object(
            'is_premium', pl.is_premium,
            'tier', pl.tier,
            'name', pl.name,
            'slug', pl.slug,
            'monthly_allowance', pl.monthly_allowance
          )
          FROM public.plans pl
          WHERE pl.id = s.plan_id
        )
      )
      FROM public.subscriptions s
      WHERE s.user_id = p_user_id
        AND s.status = 'active'
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
      ORDER BY s.current_period_end DESC NULLS FIRST
      LIMIT 1
    ),
    'is_admin', public.is_admin(p_user_id),
    'free_preview', (
      SELECT jsonb_build_object(
        'started_at', fp.started_at,
        'remaining', fp.remaining,
        'period_ends_at', fp.period_ends_at
      )
      FROM public.admin_free_preview fp
      WHERE fp.user_id = p_user_id
    ),
    'free_usage', coalesce((
      SELECT jsonb_agg(jsonb_build_object('meter', fu.meter, 'period_key', fu.period_key, 'used', fu.used))
      FROM public.free_usage fu
      WHERE fu.user_id = p_user_id
        AND fu.period_key = ANY (coalesce(p_period_keys, ARRAY[]::text[]))
    ), '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_session_user_context(uuid, text[]) IS
  'Faz 2: oturum bağlamı (durum, profil, abonelik+plan, cüzdan, yönetici, önizleme, ücretsiz sayaçlar) tek çağrıda. Yalnız okur; yalnız çağıranın kendi satırları (service_role hariç).';

REVOKE ALL ON FUNCTION public.get_session_user_context(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_session_user_context(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_session_user_context(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_user_context(uuid, text[]) TO service_role;
