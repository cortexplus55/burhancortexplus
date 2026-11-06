-- Yönetim panelinde kullanıcı yönetimi (6 Kasım 2026): yıldız düzeltmesi ve cihaz oturumlarını sıfırlama.
--
-- Yalnız ekleme ve genişletme:
--   * star_events: kaynak listesine 'admin' eklenir; yalnız bu kaynakta eksi miktar olabilir (yönetici düşer).
--     Öbür kaynakların sınırı aynen (1–500). Satır yine (öğrenci, kaynak, ref) başına bir kez.
--   * award_stars: günlük hedef ve davet sayımı yönetici düzeltmesini saymaz (yönetici +100 yazınca öğrenci
--     +25 günlük hedef bonusu almasın). Gövde 20261017120000_stars.sql ile aynı, yalnız NOT IN listelerine
--     'admin' eklendi.
--   * admin_adjust_stars(p_user, p_delta, p_ref): toplam sıfırın altına inmez; kullanıcı başına kilit.
--   * admin_reset_device_sessions(p_user): açık cihaz kayıtlarını düşürür (revoked_at) ve yetki varsa
--     auth.sessions satırlarını siler (touch_device_session ile aynı kalıp; yetki yoksa ikinci yol çalışır:
--     düşen cihazın bir sonraki sorusu {revoked: true} alır).
-- İkisi de yalnız service_role. Kod göçsüz de çalışır: yıldız düzeltmesi "veritabanı güncellemesi bekleniyor"
-- der, cihaz sıfırlama tablodaki satırları kodla düşürür.

ALTER TABLE public.star_events DROP CONSTRAINT IF EXISTS star_events_source_check;
ALTER TABLE public.star_events
  ADD CONSTRAINT star_events_source_check CHECK (source IN (
    'prep', 'duel', 'chat', 'daily_goal', 'weekly_streak',
    'invite', 'invite_welcome', 'invite_subscribed', 'prep_joined', 'admin'
  ));

ALTER TABLE public.star_events DROP CONSTRAINT IF EXISTS star_events_amount_check;
ALTER TABLE public.star_events
  ADD CONSTRAINT star_events_amount_check CHECK (
    (amount BETWEEN 1 AND 500)
    OR (source = 'admin' AND amount BETWEEN -5000 AND 5000 AND amount <> 0)
  );

CREATE OR REPLACE FUNCTION public.award_stars(p_user uuid, p_source text, p_ref text, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := public.stars_today();
  v_week date := public.stars_week_start(public.stars_today());
  v_amount integer := least(coalesce(p_amount, 0), 500);
  v_awarded integer := 0;
  v_rows integer;
  v_today integer;
  v_goal_days integer;
  v_star_days integer;
  v_inviter uuid;
BEGIN
  IF p_user IS NULL OR v_amount < 1 THEN RETURN 0; END IF;

  INSERT INTO public.star_events (user_id, source, amount, ref, day)
  VALUES (p_user, p_source, v_amount, left(coalesce(p_ref, ''), 200), v_day)
  ON CONFLICT ON CONSTRAINT star_events_once DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RETURN 0; END IF;
  v_awarded := v_amount;

  SELECT coalesce(sum(amount), 0) INTO v_today
    FROM public.star_events
   WHERE user_id = p_user AND day = v_day AND source NOT IN ('daily_goal', 'weekly_streak', 'invite_welcome', 'admin');
  IF v_today >= 50 THEN INSERT INTO public.star_events (user_id, source, amount, ref, day)
    VALUES (p_user, 'daily_goal', 25, v_day::text, v_day)
    ON CONFLICT ON CONSTRAINT star_events_once DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_awarded := v_awarded + 25;
      SELECT count(*) INTO v_goal_days
        FROM public.star_events
       WHERE user_id = p_user AND source = 'daily_goal' AND day >= v_week AND day < v_week + 7;
      IF v_goal_days >= 5 THEN INSERT INTO public.star_events (user_id, source, amount, ref, day)
        VALUES (p_user, 'weekly_streak', 100, v_week::text, v_day)
        ON CONFLICT ON CONSTRAINT star_events_once DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN v_awarded := v_awarded + 100; END IF;
      END IF;
    END IF;
  END IF;

  SELECT referred_by INTO v_inviter FROM public.profiles WHERE id = p_user;
  IF v_inviter IS NOT NULL AND v_inviter <> p_user THEN SELECT count(DISTINCT day) INTO v_star_days
      FROM public.star_events
     WHERE user_id = p_user AND source NOT IN ('invite_welcome', 'daily_goal', 'weekly_streak', 'admin');
    IF v_star_days >= 3 THEN INSERT INTO public.star_events (user_id, source, amount, ref, day)
      VALUES (v_inviter, 'invite', 100, p_user::text, v_day)
      ON CONFLICT ON CONSTRAINT star_events_once DO NOTHING;
      INSERT INTO public.star_events (user_id, source, amount, ref, day)
      VALUES (p_user, 'invite_welcome', 50, v_inviter::text, v_day)
      ON CONFLICT ON CONSTRAINT star_events_once DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows > 0 THEN v_awarded := v_awarded + 50; END IF;
    END IF;
  END IF;

  RETURN v_awarded;
END;
$$;

REVOKE ALL ON FUNCTION public.award_stars(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_stars(uuid, text, text, integer) TO service_role;

-- Yönetici yıldız ekler ya da düşer. Dönüş: {ok, total} ya da {ok:false, reason}.
CREATE OR REPLACE FUNCTION public.admin_adjust_stars(p_user uuid, p_delta integer, p_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total integer;
  v_rows integer;
BEGIN
  IF p_user IS NULL OR p_delta IS NULL OR p_delta = 0 OR p_delta < -5000 OR p_delta > 5000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_missing');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('star_events:' || p_user::text));
  SELECT coalesce(sum(amount), 0) INTO v_total FROM public.star_events WHERE user_id = p_user;
  IF v_total + p_delta < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_stars', 'total', v_total);
  END IF;

  INSERT INTO public.star_events (user_id, source, amount, ref, day)
  VALUES (p_user, 'admin', p_delta, left(coalesce(p_ref, ''), 200), public.stars_today())
  ON CONFLICT ON CONSTRAINT star_events_once DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate', 'total', v_total);
  END IF;

  RETURN jsonb_build_object('ok', true, 'total', v_total + p_delta);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_stars(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_stars(uuid, integer, text) TO service_role;

-- Bütün cihazlardan çıkış: açık cihaz kayıtları düşer, yetki varsa Supabase oturumları silinir.
CREATE OR REPLACE FUNCTION public.admin_reset_device_sessions(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_revoked integer := 0;
  v_auth integer := 0;
BEGIN
  IF p_user IS NULL THEN
    RETURN jsonb_build_object('revoked', 0, 'authSessions', 0);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('user_device_sessions:' || p_user::text));

  UPDATE public.user_device_sessions
     SET revoked_at = now()
   WHERE user_id = p_user AND revoked_at IS NULL;
  GET DIAGNOSTICS v_revoked = ROW_COUNT;

  IF to_regclass('auth.sessions') IS NOT NULL
     AND has_schema_privilege('auth', 'USAGE')
     AND has_table_privilege('auth.sessions', 'DELETE') THEN
    BEGIN
      DELETE FROM auth.sessions WHERE user_id = p_user;
      GET DIAGNOSTICS v_auth = ROW_COUNT;
    EXCEPTION WHEN insufficient_privilege THEN
      v_auth := 0;
    END;
  END IF;

  RETURN jsonb_build_object('revoked', v_revoked, 'authSessions', v_auth);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_device_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_device_sessions(uuid) TO service_role;
