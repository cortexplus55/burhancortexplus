-- Hesap paylaşımı koruması (31 Ekim 2026, ürün sahibinin kararı): bir hesap aynı anda en çok 2 cihazda açık
-- kalır (ör. bir bilgisayar + bir telefon). Üçüncü cihaz girince yeni cihaz açık kalır; en uzun süredir
-- görünmeyen cihazın oturumu kapanır. Yönetici (kurucu) muaf.
--
-- Neden uygulamada: Supabase'in "kullanıcı başına tek oturum" ayarı ücretli planda. Cihaz = Supabase oturumu
-- (erişim jetonundaki `session_id`; jeton yenilense de aynı kalır). Ara katman (src/lib/auth/device-sessions.ts)
-- bu fonksiyonu tarayıcı başına en çok 5 dakikada bir, yalnız uygulama sayfalarında çağırır; her hatada geçirir.
--
-- Düşürülen oturum iki yoldan kapanır:
--   1. Satırı auth.sessions'tan silinir: yenileme jetonu ölür, Supabase o jetonla gelen getUser'a
--      "session_not_found" der, ara katman kullanıcıyı girişe "başka cihaz" notuyla gönderir.
--   2. auth.sessions'a dokunulamıyorsa (yetki ya da görünürlük yoksa) yalnız bizim satır düşer; o cihazın bir
--      sonraki sorusu `{revoked: true}` alır ve ara katman bu cihazda çıkış yapar.
--
-- Yalnız ekleme: yeni tablo ve yeni fonksiyon, DROP yok. Kod göçten önce de çalışır (RPC bulunamazsa geçirir).

CREATE TABLE IF NOT EXISTS public.user_device_sessions (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS user_device_sessions_user_idx
  ON public.user_device_sessions (user_id, revoked_at);

-- Satır güvenliği açık, politika yok: yalnız sunucu (service_role) okur ve yazar.
ALTER TABLE public.user_device_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_device_sessions FROM anon, authenticated;

-- Bu oturumu "görüldü" yazar, hesabın açık cihazlarını sayar, 2'yi aşan en eski cihazları düşürür.
-- Dönüş: {revoked: true} bu oturum daha önce düşürüldüyse; yoksa {revoked: false, dropped: N}
-- (yöneticide {exempt: true}).
CREATE OR REPLACE FUNCTION public.touch_device_session(
  p_user_id uuid,
  p_session_id uuid,
  p_user_agent text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $BODY$
DECLARE
  v_keep CONSTANT integer := 2;
  v_owner uuid;
  v_revoked_at timestamptz;
  v_auth boolean := false;
  v_dropped uuid[] := '{}';
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL THEN
    RETURN jsonb_build_object('revoked', false, 'skipped', true);
  END IF;

  -- Aynı hesaba iki cihaz aynı anda girerse sayım yarışmasın: kullanıcı başına işlem kilidi.
  PERFORM pg_advisory_xact_lock(hashtext('user_device_sessions:' || p_user_id::text));

  SELECT user_id, revoked_at INTO v_owner, v_revoked_at
    FROM public.user_device_sessions
   WHERE session_id = p_session_id;
  -- Oturum kimliği başka bir hesaba yazılmışsa dokunulmaz (olmaması gerekir; olursa kimseyi düşürmeyiz).
  IF FOUND AND v_owner <> p_user_id THEN
    RETURN jsonb_build_object('revoked', false, 'skipped', true);
  END IF;
  IF v_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('revoked', true);
  END IF;

  INSERT INTO public.user_device_sessions AS d (session_id, user_id, user_agent)
  VALUES (p_session_id, p_user_id, NULLIF(left(COALESCE(p_user_agent, ''), 300), ''))
  ON CONFLICT (session_id) DO UPDATE
    SET last_seen_at = now(),
        user_agent = COALESCE(EXCLUDED.user_agent, d.user_agent);

  IF public.is_admin(p_user_id) THEN
    RETURN jsonb_build_object('revoked', false, 'exempt', true);
  END IF;

  -- auth.sessions'a bakılabiliyor mu. Yetki tek başına yetmez: bu istek canlı bir oturumdan geliyor, kendi
  -- satırımız görünmüyorsa (satır güvenliği, farklı şema) tabloya güvenilmez ve yalnız kendi kayıtlarımızla
  -- sayılır. Yoksa çıkış yapılmış her cihaz "bitti" sanılıp silinir, sınır sessizce kapanırdı.
  IF to_regclass('auth.sessions') IS NOT NULL
     AND has_schema_privilege('auth', 'USAGE')
     AND has_table_privilege('auth.sessions', 'SELECT')
     AND has_table_privilege('auth.sessions', 'DELETE') THEN
    v_auth := EXISTS (SELECT 1 FROM auth.sessions WHERE id = p_session_id);
  END IF;

  -- Çıkış yapılmış ya da süresi dolmuş oturum artık cihaz değildir: sayılmaz, satırı silinir. Yoksa aynı
  -- bilgisayarda çıkıp yeniden giren öğrencinin ölü oturumları canlı telefonunu düşürürdü.
  IF v_auth THEN
    DELETE FROM public.user_device_sessions d
     WHERE d.user_id = p_user_id
       AND d.revoked_at IS NULL
       AND d.session_id <> p_session_id
       AND NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = d.session_id);
  END IF;

  -- 30 gündür görünmeyen cihaz sayılmaz; düşürülen satır 30 gün durur (o cihazın giriş ekranı notu için).
  DELETE FROM public.user_device_sessions
   WHERE user_id = p_user_id
     AND session_id <> p_session_id
     AND ((revoked_at IS NULL AND last_seen_at < now() - interval '30 days')
       OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days'));

  -- Bu oturum ve en son görülen bir cihaz kalır; gerisi düşer.
  WITH ranked AS (
    SELECT session_id
      FROM public.user_device_sessions
     WHERE user_id = p_user_id
       AND revoked_at IS NULL
     ORDER BY (session_id = p_session_id) DESC, last_seen_at DESC, created_at DESC
    OFFSET v_keep
  ), dropped AS (
    UPDATE public.user_device_sessions d
       SET revoked_at = now()
      FROM ranked
     WHERE d.session_id = ranked.session_id
    RETURNING d.session_id
  )
  SELECT COALESCE(array_agg(session_id), '{}') INTO v_dropped FROM dropped;

  IF v_auth AND cardinality(v_dropped) > 0 THEN
    BEGIN
      -- Yenileme jetonları oturumla birlikte gider (auth.refresh_tokens → ON DELETE CASCADE).
      DELETE FROM auth.sessions WHERE id = ANY (v_dropped) AND user_id = p_user_id;
    EXCEPTION WHEN insufficient_privilege THEN
      -- Silinemediyse 2. yol çalışır: düşen cihazın bir sonraki sorusu {revoked: true} alır.
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object('revoked', false, 'dropped', cardinality(v_dropped));
END;
$BODY$;

REVOKE ALL ON FUNCTION public.touch_device_session(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_device_session(uuid, uuid, text) TO service_role;
