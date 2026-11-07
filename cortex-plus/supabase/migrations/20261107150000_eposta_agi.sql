-- E-posta ağı (7 Kasım 2026): tercihler, yönetimden gönderim, akşam geri sayımı, davet e-postaları ve davet hediyesinde
-- günlük tavan + kapatma anahtarı. Yalnız ekleme ve bir fonksiyonun (grant_referral_gift) korumalı yeniden tanımı.
--
-- Hukuki çerçeve (Ticari Elektronik İletiler Hakkında Yönetmelik): kampanya ve duyuru e-postası yalnız önceden izin
-- verene gider (`email_preferences.marketing`, kayıtta ya da Ayarlar'da işaretlenir; işaretli gelmez). Hesapla ilgili
-- bilgilendirme (bakım, güvenlik, ödeme, hediye yazıldı) izinsiz gider. Kampanya gönderimi ayrıca `marketing_email`
-- özellik anahtarına bağlı ve KAPALI doğar: İYS kaydı tamamlanınca kurucu açar.
--
-- Tarayıcıdan yazma yok: bütün tablolar ve fonksiyonlar yalnız service_role içindir (6 Kasım güvenlik paketi).

-- 1) Tercihler: kampanya izni. Hatırlatma tercihi `profiles.study_reminder_email`de kalır (20260911160000).
CREATE TABLE IF NOT EXISTS public.email_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  marketing boolean NOT NULL DEFAULT false,
  marketing_changed_at timestamptz,
  marketing_source text,
  marketing_ip_hash text,
  marketing_text_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_preferences FROM anon, authenticated;
GRANT ALL ON public.email_preferences TO service_role;

-- 2) Yönetimden gönderimler: bir gönderim = bir satır; alıcılar ayrı tabloda (durum alıcı başına).
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('service', 'marketing', 'single')),
  subject text NOT NULL,
  body text NOT NULL,
  cta_label text,
  cta_path text,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'cancelled')),
  total integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  stop_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS email_campaigns_created_idx ON public.email_campaigns (created_at DESC);
CREATE INDEX IF NOT EXISTS email_campaigns_open_idx ON public.email_campaigns (status) WHERE status = 'sending';

CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns (id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  -- Yalnız hesabı olmayan tek alıcı için (destek cevabı gibi); hesaplı alıcının adresi gönderim anında okunur.
  email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'sent', 'failed', 'skipped')),
  error text,
  provider_id text,
  claimed_at timestamptz,
  sent_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS email_campaign_recipients_user_idx
  ON public.email_campaign_recipients (campaign_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_campaign_recipients_queue_idx
  ON public.email_campaign_recipients (campaign_id, status, id);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_campaigns, public.email_campaign_recipients FROM anon, authenticated;
GRANT ALL ON public.email_campaigns, public.email_campaign_recipients TO service_role;

-- 3) Tek seferlik e-postalar (davet, hediye bildirimi): aynı öğrenciye ikinci kez gitmesin.
CREATE UNIQUE INDEX IF NOT EXISTS email_events_once_idx
  ON public.email_events (user_id, template_key) WHERE template_key LIKE 'once:%';

-- 4) Hedef kitle: doğrulanmış, askıda ya da silinmiş olmayan hesaplar. Kampanya (marketing) yalnız izin verenlere.
--    Sınava kalan gün: yaklaşan en yakın sınav tarihi (İstanbul günü).
CREATE OR REPLACE FUNCTION public.email_audience(
  p_kind text,
  p_plan text DEFAULT 'all',
  p_signup_days integer DEFAULT NULL,
  p_exam_days integer DEFAULT NULL
)
RETURNS TABLE (user_id uuid, email text, first_name text, days_to_exam integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id,
         u.email::text,
         NULLIF(split_part(btrim(COALESCE(p.full_name, '')), ' ', 1), ''),
         ex.days
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    LEFT JOIN LATERAL (
      SELECT (min(e.exam_date) - (now() AT TIME ZONE 'Europe/Istanbul')::date)::integer AS days
        FROM public.exam_preps e
       WHERE e.user_id = p.id
         AND e.exam_date >= (now() AT TIME ZONE 'Europe/Istanbul')::date
    ) ex ON true
   WHERE p.deleted_at IS NULL
     AND p.suspended_at IS NULL
     AND u.email IS NOT NULL
     AND public.account_verified(p.id)
     AND (p_kind <> 'marketing' OR EXISTS (
           SELECT 1 FROM public.email_preferences ep WHERE ep.user_id = p.id AND ep.marketing))
     AND (p_plan = 'all' OR (p_plan = 'paid') = EXISTS (
           SELECT 1 FROM public.subscriptions s
             JOIN public.plans pl ON pl.id = s.plan_id
            WHERE s.user_id = p.id
              AND s.status = 'active'
              AND pl.is_premium
              AND (s.current_period_end IS NULL OR s.current_period_end > now())))
     AND (p_signup_days IS NULL OR p.created_at >= now() - make_interval(days => p_signup_days))
     AND (p_exam_days IS NULL OR (ex.days IS NOT NULL AND ex.days <= p_exam_days));
$$;

CREATE OR REPLACE FUNCTION public.email_audience_count(
  p_kind text, p_plan text DEFAULT 'all', p_signup_days integer DEFAULT NULL, p_exam_days integer DEFAULT NULL
)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*)::integer FROM public.email_audience(p_kind, p_plan, p_signup_days, p_exam_days);
$$;

CREATE OR REPLACE FUNCTION public.email_audience_sample(
  p_kind text, p_plan text DEFAULT 'all', p_signup_days integer DEFAULT NULL, p_exam_days integer DEFAULT NULL,
  p_limit integer DEFAULT 5
)
RETURNS TABLE (email text, first_name text, days_to_exam integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.email, a.first_name, a.days_to_exam
    FROM public.email_audience(p_kind, p_plan, p_signup_days, p_exam_days) a
   ORDER BY a.user_id
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 20));
$$;

-- Hesabı olan tek alıcıyı e-postadan bulur (yönetimden tek kişiye gönderimde kişiselleştirme için).
CREATE OR REPLACE FUNCTION public.email_find_user(p_email text)
RETURNS TABLE (user_id uuid, first_name text, days_to_exam integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id,
         NULLIF(split_part(btrim(COALESCE(p.full_name, '')), ' ', 1), ''),
         (SELECT (min(e.exam_date) - (now() AT TIME ZONE 'Europe/Istanbul')::date)::integer
            FROM public.exam_preps e
           WHERE e.user_id = p.id AND e.exam_date >= (now() AT TIME ZONE 'Europe/Istanbul')::date)
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
   WHERE lower(u.email) = lower(btrim(p_email))
     AND p.deleted_at IS NULL
   LIMIT 1;
$$;

-- 5) Gönderim kuyruğu. `open`: hedef kitleyi alıcı satırlarına yazar. `claim`: sıradaki N alıcıyı sahiplenir (iki
--    gönderim aynı alıcıyı almaz: SKIP LOCKED); gönderim anında izin geri alınmışsa ya da hesap kapanmışsa atlar.
CREATE OR REPLACE FUNCTION public.email_campaign_open(
  p_campaign uuid, p_kind text, p_plan text, p_signup_days integer, p_exam_days integer
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.email_campaign_recipients (campaign_id, user_id)
  SELECT p_campaign, a.user_id
    FROM public.email_audience(p_kind, p_plan, p_signup_days, p_exam_days) a
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.email_campaigns SET total = v_count, updated_at = now() WHERE id = p_campaign;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.email_campaign_claim(p_campaign uuid, p_limit integer)
RETURNS TABLE (recipient_id bigint, user_id uuid, email text, first_name text, days_to_exam integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_kind text;
  v_ids bigint[];
BEGIN
  SELECT c.kind INTO v_kind FROM public.email_campaigns c WHERE c.id = p_campaign AND c.status = 'sending';
  IF v_kind IS NULL THEN RETURN; END IF;

  -- İşlev yarıda düştüyse sahiplenilmiş ama gönderilmemiş satırlar 15 dakika sonra yeniden kuyruğa girer.
  UPDATE public.email_campaign_recipients r
     SET status = 'pending', claimed_at = NULL
   WHERE r.campaign_id = p_campaign AND r.status = 'claimed' AND r.claimed_at < now() - interval '15 minutes';

  SELECT array_agg(s.id) INTO v_ids FROM (
    SELECT r.id FROM public.email_campaign_recipients r
     WHERE r.campaign_id = p_campaign AND r.status = 'pending'
     ORDER BY r.id
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
     FOR UPDATE SKIP LOCKED
  ) s;
  IF v_ids IS NULL THEN RETURN; END IF;

  UPDATE public.email_campaign_recipients r SET status = 'claimed', claimed_at = now() WHERE r.id = ANY (v_ids);

  UPDATE public.email_campaign_recipients r
     SET status = 'skipped',
         error = CASE
           WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = r.user_id AND (p.deleted_at IS NOT NULL OR p.suspended_at IS NOT NULL))
             THEN 'hesap_kapali'
           ELSE 'izin_yok' END
   WHERE r.id = ANY (v_ids)
     AND r.user_id IS NOT NULL
     AND (
       EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = r.user_id AND (p.deleted_at IS NOT NULL OR p.suspended_at IS NOT NULL))
       OR (v_kind = 'marketing' AND NOT EXISTS (
             SELECT 1 FROM public.email_preferences ep WHERE ep.user_id = r.user_id AND ep.marketing))
     );

  RETURN QUERY
  SELECT r.id,
         r.user_id,
         COALESCE(r.email, u.email::text),
         NULLIF(split_part(btrim(COALESCE(p.full_name, '')), ' ', 1), ''),
         (SELECT (min(e.exam_date) - (now() AT TIME ZONE 'Europe/Istanbul')::date)::integer
            FROM public.exam_preps e
           WHERE e.user_id = r.user_id AND e.exam_date >= (now() AT TIME ZONE 'Europe/Istanbul')::date)
    FROM public.email_campaign_recipients r
    LEFT JOIN auth.users u ON u.id = r.user_id
    LEFT JOIN public.profiles p ON p.id = r.user_id
   WHERE r.id = ANY (v_ids) AND r.status = 'claimed'
   ORDER BY r.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.email_campaign_mark_sent(p_ids bigint[], p_provider_ids text[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.email_campaign_recipients r
     SET status = 'sent', sent_at = now(), error = NULL, provider_id = x.provider_id
    FROM (SELECT i.id, p.provider_id
            FROM unnest(p_ids) WITH ORDINALITY AS i(id, n)
            LEFT JOIN unnest(COALESCE(p_provider_ids, ARRAY[]::text[])) WITH ORDINALITY AS p(provider_id, n) USING (n)) x
   WHERE r.id = x.id;
$$;

-- Başarısız (failed) ya da yeniden kuyruğa dönen (pending: günlük kota doldu) alıcılar.
CREATE OR REPLACE FUNCTION public.email_campaign_mark(p_ids bigint[], p_status text, p_error text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.email_campaign_recipients r
     SET status = p_status,
         error = left(p_error, 300),
         claimed_at = CASE WHEN p_status = 'pending' THEN NULL ELSE r.claimed_at END
   WHERE r.id = ANY (p_ids) AND p_status IN ('pending', 'failed', 'skipped');
$$;

-- Sayıları yeniden hesaplar; bekleyen ve sahiplenilmiş satır kalmadıysa gönderimi bitirir.
CREATE OR REPLACE FUNCTION public.email_campaign_refresh(p_campaign uuid)
RETURNS TABLE (campaign_status text, total_count integer, sent_count integer, failed_count integer, skipped_count integer, remaining_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_sent integer; v_failed integer; v_skipped integer; v_remaining integer; v_total integer;
BEGIN
  SELECT count(*) FILTER (WHERE r.status = 'sent'),
         count(*) FILTER (WHERE r.status = 'failed'),
         count(*) FILTER (WHERE r.status = 'skipped'),
         count(*) FILTER (WHERE r.status IN ('pending', 'claimed')),
         count(*)
    INTO v_sent, v_failed, v_skipped, v_remaining, v_total
    FROM public.email_campaign_recipients r WHERE r.campaign_id = p_campaign;
  UPDATE public.email_campaigns c
     SET sent = v_sent, failed = v_failed, skipped = v_skipped, total = v_total, updated_at = now(),
         status = CASE WHEN c.status = 'sending' AND v_remaining = 0 THEN 'sent' ELSE c.status END,
         finished_at = CASE WHEN c.status = 'sending' AND v_remaining = 0 THEN now() ELSE c.finished_at END
   WHERE c.id = p_campaign;
  RETURN QUERY
    SELECT c.status, c.total, c.sent, c.failed, c.skipped, v_remaining FROM public.email_campaigns c WHERE c.id = p_campaign;
END;
$$;

-- 6) Günlük akşam e-postalarına eklenen iki tek seferlik gönderim.
--    Davet e-postası: kampanya izni verenlere, kayıttan en az 6 saat sonra bir kez. Hediye bildirimi: davet edene,
--    davetlisi ilk çalışmasını yapıp hediye yazılınca bir kez (hesapla ilgili bilgilendirme; izin istemez).
CREATE OR REPLACE FUNCTION public.email_due_referral_invites(p_limit integer DEFAULT 200)
RETURNS TABLE (user_id uuid, email text, first_name text, referral_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, u.email::text, NULLIF(split_part(btrim(COALESCE(p.full_name, '')), ' ', 1), ''), p.referral_code
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    JOIN public.email_preferences ep ON ep.user_id = p.id AND ep.marketing
   WHERE p.created_at <= now() - interval '6 hours'
     AND p.created_at >= now() - interval '10 days'
     AND p.deleted_at IS NULL AND p.suspended_at IS NULL
     AND u.email IS NOT NULL
     AND public.account_verified(p.id)
     AND NOT EXISTS (SELECT 1 FROM public.email_events e WHERE e.user_id = p.id AND e.template_key = 'once:referral_invite')
   ORDER BY p.created_at
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
$$;

CREATE OR REPLACE FUNCTION public.email_due_referral_gift_mails(p_limit integer DEFAULT 200)
RETURNS TABLE (user_id uuid, email text, first_name text, mail_key text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.user_id,
         u.email::text,
         NULLIF(split_part(btrim(COALESCE(p.full_name, '')), ' ', 1), ''),
         'once:rg:' || substring(l.idempotency_key FROM 'referral-gift-inviter:(.*)$')
    FROM public.credit_ledger l
    JOIN public.profiles p ON p.id = l.user_id
    JOIN auth.users u ON u.id = l.user_id
   WHERE l.idempotency_key LIKE 'referral-gift-inviter:%'
     AND l.created_at >= now() - interval '3 days'
     AND p.deleted_at IS NULL AND p.suspended_at IS NULL
     AND u.email IS NOT NULL
     AND public.account_verified(l.user_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.email_events e
        WHERE e.user_id = l.user_id
          AND e.template_key = 'once:rg:' || substring(l.idempotency_key FROM 'referral-gift-inviter:(.*)$'))
   ORDER BY l.created_at
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
$$;

-- 7) Davet hediyesi: günlük tavan ve kapatma anahtarı. Gerçek davet sayısı yüzlerceyi bulmaz; tavan sahte hesap
--    sürüsünün en kötü günlük bedelini sınırlar (150 çift × 180 kredi ≈ 27 $ üst sınır). Tavan dolunca ya da
--    anahtar kapalıyken hediye yazılmaz, davetli bir sonraki harcamasında yeniden denenir (yarın ya da açılınca);
--    hiçbir durumda kullanıcının işini düşürmez.
CREATE TABLE IF NOT EXISTS public.referral_gift_days (
  day date PRIMARY KEY,
  gifts integer NOT NULL DEFAULT 0
);
ALTER TABLE public.referral_gift_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_gift_days FROM anon, authenticated;
GRANT ALL ON public.referral_gift_days TO service_role;

INSERT INTO public.feature_flags (key, enabled, description) VALUES
  ('marketing_email', false,
   'Kampanya ve duyuru e-postaları (yalnız izin verenlere). İYS kaydı tamamlanmadan açılmaz.'),
  ('referral_gifts', true,
   'Davet hediyesi. Kapalıyken yeni hediye yazılmaz; açılınca bekleyenler sonraki harcamada yazılır. Günlük tavan: metadata.daily_cap (varsayılan 150 çift).')
ON CONFLICT (key) DO NOTHING;

UPDATE public.feature_flags
   SET metadata = jsonb_build_object('daily_cap', 150)
 WHERE key = 'referral_gifts' AND metadata IS NULL;

CREATE OR REPLACE FUNCTION public.grant_referral_gift(p_user_id uuid)
RETURNS void AS $BODY$
DECLARE
  v_inviter uuid;
  v_gift integer := 90;
  v_verified boolean;
  v_email text;
  v_created timestamptz;
  v_inviter_email text;
  v_enabled boolean;
  v_cap integer;
  v_day date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_slot integer;
  v_inviter_gifted boolean := false;
BEGIN
  SELECT referred_by INTO v_inviter FROM public.profiles WHERE id = p_user_id;
  IF v_inviter IS NULL OR v_inviter = p_user_id THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE user_id = p_user_id AND idempotency_key = 'referral-gift:' || p_user_id::text) THEN
    RETURN;
  END IF;
  BEGIN
    v_verified := public.account_verified(p_user_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
  IF NOT COALESCE(v_verified, false) THEN RETURN; END IF;
  -- Aynı posta kutusu (31 Ekim 2026): davetli davet edenin kutusunun başka yazımıysa ya da kutunun daha önce açılmış
  -- başka bir hesabı varsa hediye yok. Kutunun ilk hesabı hediyesini alabilir.
  SELECT u.email, u.created_at INTO v_email, v_created FROM auth.users u WHERE u.id = p_user_id;
  SELECT u.email INTO v_inviter_email FROM auth.users u WHERE u.id = v_inviter;
  IF v_email IS NOT NULL THEN
    IF v_inviter_email IS NOT NULL AND public.normalize_email(v_email) = public.normalize_email(v_inviter_email) THEN
      RETURN;
    END IF;
    IF EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id <> p_user_id
        AND u.email IS NOT NULL
        AND (v_created IS NULL OR u.created_at < v_created)
        AND public.normalize_email(u.email) = public.normalize_email(v_email)
    ) THEN
      RETURN;
    END IF;
  END IF;

  -- Kapatma anahtarı ve günlük tavan (7 Kasım 2026). Anahtar satırı yoksa açık, tavan 150; okunamazsa varsayılan.
  BEGIN
    SELECT f.enabled, NULLIF(f.metadata ->> 'daily_cap', '')::integer
      INTO v_enabled, v_cap
      FROM public.feature_flags f WHERE f.key = 'referral_gifts';
    IF NOT FOUND THEN v_enabled := true; v_cap := 150; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_enabled := true; v_cap := 150;
  END;
  v_enabled := COALESCE(v_enabled, true);
  v_cap := COALESCE(v_cap, 150);
  IF NOT v_enabled OR v_cap < 1 THEN RETURN; END IF;

  -- Hediyeden önce iki cüzdan birden, kimlik sırasıyla kilitlenir. Karşılıklı davette (A'yı B, B'yi A
  -- davet etmiş; kayıt yalnız kendini davet etmeyi engelliyor) ikisi aynı anda ilk işini yapınca her işlem
  -- önce kendi cüzdanını, sonra ötekini kilitleseydi birbirini beklerdi (40P01, istek düşer); sabit sırada
  -- ikincisi birincinin bitmesini bekler. Davet edenin sayımı da bu kilidin altında: aynı anda ilk işini
  -- yapan iki davetli 3 sınırını aşamaz (ikincisi kilidi bekler, sayım birincinin yazdığı satırı görür).
  -- credit_gift aynı satırları yeniden kilitler; aynı işlemde bu bekletmez.
  PERFORM 1 FROM public.credit_wallets WHERE user_id IN (p_user_id, v_inviter) ORDER BY user_id FOR UPDATE;

  -- Günün bir yuvası (tek satırlık sayaç; tavan doluysa güncelleme olmaz, yuva gelmez). Cüzdan kilidinden sonra:
  -- bütün hediye işlemleri aynı sırayı izler.
  INSERT INTO public.referral_gift_days (day, gifts) VALUES (v_day, 1)
  ON CONFLICT (day) DO UPDATE SET gifts = public.referral_gift_days.gifts + 1
    WHERE public.referral_gift_days.gifts < v_cap
  RETURNING gifts INTO v_slot;
  IF v_slot IS NULL THEN RETURN; END IF;

  PERFORM public.credit_gift(p_user_id, v_gift, 'referral-gift:' || p_user_id::text,
    jsonb_build_object('reason', 'referral', 'side', 'invitee', 'inviter', v_inviter));
  IF (SELECT count(*) FROM public.credit_ledger WHERE user_id = v_inviter AND idempotency_key LIKE 'referral-gift-inviter:%') < 3 THEN
    PERFORM public.credit_gift(v_inviter, v_gift, 'referral-gift-inviter:' || p_user_id::text,
      jsonb_build_object('reason', 'referral', 'side', 'inviter', 'invitee', p_user_id));
    v_inviter_gifted := true;
  END IF;

  -- Uygulama içi bildirim (iki taraf). Düşse de hediye yazılmış kalır: bildirim hiçbir zaman işi düşürmez.
  BEGIN
    INSERT INTO public.notifications (user_id, title, body)
    VALUES (p_user_id, 'Davet hediyen yazıldı', '3 ders hediye hesabına eklendi.');
    IF v_inviter_gifted THEN
      INSERT INTO public.notifications (user_id, title, body)
      VALUES (v_inviter, 'Arkadaşın ilk çalışmasını yaptı', 'Davet hediyen yazıldı: 3 ders hesabına eklendi.');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.grant_referral_gift(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.grant_referral_gift(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_referral_gift(uuid) TO service_role;

-- 8) Yönetim: davet programının özeti ve en çok davet edenler.
CREATE OR REPLACE FUNCTION public.referral_admin_stats()
RETURNS TABLE (invited bigint, gifted bigint, gifts_today integer, daily_cap integer, enabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_enabled boolean;
  v_cap integer;
BEGIN
  SELECT f.enabled, NULLIF(f.metadata ->> 'daily_cap', '')::integer INTO v_enabled, v_cap
    FROM public.feature_flags f WHERE f.key = 'referral_gifts';
  IF NOT FOUND THEN v_enabled := true; v_cap := 150; END IF;
  RETURN QUERY SELECT
    (SELECT count(*) FROM public.profiles p WHERE p.referred_by IS NOT NULL),
    (SELECT count(*) FROM public.credit_ledger l WHERE l.idempotency_key LIKE 'referral-gift:%'),
    COALESCE((SELECT d.gifts FROM public.referral_gift_days d WHERE d.day = (now() AT TIME ZONE 'Europe/Istanbul')::date), 0),
    COALESCE(v_cap, 150),
    COALESCE(v_enabled, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.referral_top_inviters(p_limit integer DEFAULT 5)
RETURNS TABLE (inviter_id uuid, full_name text, invited bigint, gifted bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.referred_by,
         NULLIF(btrim(COALESCE(i.full_name, '')), ''),
         count(*),
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM public.credit_ledger l
            WHERE l.user_id = p.id AND l.idempotency_key = 'referral-gift:' || p.id::text))
    FROM public.profiles p
    LEFT JOIN public.profiles i ON i.id = p.referred_by
   WHERE p.referred_by IS NOT NULL
   GROUP BY p.referred_by, i.full_name
   ORDER BY count(*) DESC, p.referred_by
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 20));
$$;

-- 9) Günlük hatırlatma: e-posta yalnız doğrulanmış adrese gider. Anında kayıt (31 Ekim) doğrulamadan girişe izin verir;
--    başkasının adresiyle açılmış bir hesaba her akşam e-posta gitmesi şikâyet ve gönderici itibarı demek.
CREATE OR REPLACE FUNCTION public.email_verified_ids(p_ids uuid[])
RETURNS TABLE (user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT i FROM unnest(p_ids) AS i WHERE public.account_verified(i);
$$;

-- Bütün yeni fonksiyonlar yalnız service_role içindir.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'email_audience(text,text,integer,integer)',
    'email_audience_count(text,text,integer,integer)',
    'email_audience_sample(text,text,integer,integer,integer)',
    'email_find_user(text)',
    'email_campaign_open(uuid,text,text,integer,integer)',
    'email_campaign_claim(uuid,integer)',
    'email_campaign_mark_sent(bigint[],text[])',
    'email_campaign_mark(bigint[],text,text)',
    'email_campaign_refresh(uuid)',
    'email_due_referral_invites(integer)',
    'email_due_referral_gift_mails(integer)',
    'referral_admin_stats()',
    'referral_top_inviters(integer)',
    'email_verified_ids(uuid[])'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END $$;
