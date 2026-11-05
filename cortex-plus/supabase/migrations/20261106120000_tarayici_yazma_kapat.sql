-- Tarayıcıdan doğrudan veritabanı yazımı kapanır (6 Kasım 2026, 360° denetim P0).
--
-- Neden: Supabase varsayılan olarak anon ve authenticated rollerine her tabloda INSERT, UPDATE,
-- DELETE verir; politikalarımız "FOR ALL USING (sahibi = ben)" biçiminde ve sütun sınırı yok. Açık
-- anahtar tarayıcıda olduğu için oturum açmış her öğrenci, uygulamanın API'sini atlayıp kendi
-- satırlarını istediği gibi değiştirebiliyordu: kilitli konu için sahte deneme kaydı (ücretsiz kilit),
-- belge sayfa sayısını sıfırlama (25 sayfa sınırı), profil oluşturma tarihini geri çekme (e-posta
-- doğrulaması ve davet kredisi), cevap anahtarı değiştirip soru bildirimi ödülü, sahte veli bağıyla
-- başka öğrencinin profilini okuma, belge özetiyle tekilleştirmeyi zehirleme.
--
-- Uygulama bu tablolara yazarken sunucu anahtarını (service_role) kullanır. Öğrenci oturumuyla yazan
-- kod taranıp listelendi; listedeki tablolar dışında hiçbir tabloya tarayıcıdan yazım kalmaz.
-- Yalnız ekleme / izin kısma: veri silinmez, politika kaldırılmaz.

-- 1) Varsayılan kapalı. Öğrenci oturumuyla meşru yazımı olan tablolar listede (kod taraması,
--    6 Kasım 2026): profil (aşağıda tetikleyiciyle korunur), sohbet, bildirim, günlük tekrar,
--    veri silme isteği, hedefler, yanlış defteri, veliden ödeme isteği, veli bağı (aşağıda
--    tetikleyiciyle korunur), eski çalışma planı görevleri.
DO $$
DECLARE
  t text;
  keep text[] := ARRAY[
    'profiles', 'conversations', 'messages', 'notifications', 'daily_drills',
    'data_deletion_requests', 'learning_goals', 'mistake_entries',
    'parent_payment_requests', 'parent_student_links', 'study_plan_tasks'
  ];
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', t);
    IF NOT (t = ANY (keep)) THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;

-- Bundan sonra açılan tablolar da yazmaya kapalı doğar; tarayıcı yazımı gereken tablo bunu
-- açıkça GRANT ile ister (AGENTS.md).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

-- 2) Profil: öğrencinin yazabildiği alanlar ad, sınıf, okul, tercihler ve avatar. Hesap durumu,
--    oluşturma tarihi, roller, davet kodları dondurulur. Davet eden ve davet kodu yalnız boştan bir
--    kez yazılır (kayıt ve davet sayfası öğrenci oturumuyla yazıyor). Sunucu (service_role) ve
--    SECURITY DEFINER fonksiyonları bu kuraldan etkilenmez (current_user farklıdır).
CREATE OR REPLACE FUNCTION public.profiles_guard_client_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.deleted_at := NULL;
    NEW.suspended_at := NULL;
    NEW.suspended_reason := NULL;
    NEW.teacher_application_status := 'none';
    NEW.primary_role := 'student';
    NEW.learning_role := 'student';
    NEW.invite_code := NULL;
    NEW.referral_code := NULL;
    NEW.referred_by := NULL;
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  NEW.deleted_at := OLD.deleted_at;
  NEW.suspended_at := OLD.suspended_at;
  NEW.suspended_reason := OLD.suspended_reason;
  NEW.teacher_application_status := OLD.teacher_application_status;
  NEW.learning_role := OLD.learning_role;
  NEW.invite_code := OLD.invite_code;
  IF NEW.primary_role IS DISTINCT FROM OLD.primary_role AND NEW.primary_role IS DISTINCT FROM 'student' THEN
    NEW.primary_role := OLD.primary_role;
  END IF;
  IF OLD.referral_code IS NOT NULL THEN
    NEW.referral_code := OLD.referral_code;
  END IF;
  IF OLD.referred_by IS NOT NULL OR NEW.referred_by = OLD.id THEN
    NEW.referred_by := OLD.referred_by;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_guard_client_write ON public.profiles;
CREATE TRIGGER profiles_guard_client_write
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_client_write();

-- 3) "Eski hesap" (e-posta doğrulamasından muaf) kararı öğrencinin yazamadığı kaynaktan.
CREATE OR REPLACE FUNCTION public.account_grandfathered(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT u.created_at < timestamptz '2026-09-05 00:00:00+00' FROM auth.users u WHERE u.id = p_user_id),
    false);
$$;
REVOKE ALL ON FUNCTION public.account_grandfathered(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_grandfathered(uuid) TO service_role;

-- 4) Veli bağı: tarayıcıdan yalnız bekleyen istek açılır; bağın tarafları sonradan değişmez;
--    yalnız öğrenci kendi bağını etkinleştirir. Profil yalnız ETKİN bağla görünür (bekleyen sahte
--    bağla başka öğrencinin profili okunuyordu).
CREATE OR REPLACE FUNCTION public.parent_links_guard_client_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'parent_link_forbidden' USING ERRCODE = '42501';
    END IF;
    NEW.status := 'pending';
    NEW.accepted_at := NULL;
    RETURN NEW;
  END IF;
  NEW.parent_id := OLD.parent_id;
  NEW.student_id := OLD.student_id;
  NEW.invite_email := OLD.invite_email;
  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active'
     AND OLD.student_id IS DISTINCT FROM auth.uid() THEN
    NEW.status := OLD.status;
    NEW.accepted_at := OLD.accepted_at;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS parent_links_guard_client_write ON public.parent_student_links;
CREATE TRIGGER parent_links_guard_client_write
  BEFORE INSERT OR UPDATE ON public.parent_student_links
  FOR EACH ROW EXECUTE FUNCTION public.parent_links_guard_client_write();

CREATE OR REPLACE FUNCTION public.profile_link_exists(p_viewer uuid, p_target uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_student_links l
    WHERE l.status = 'active'
      AND (
        (l.parent_id = p_viewer AND l.student_id = p_target)
        OR (l.student_id = p_viewer AND l.parent_id = p_target)
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
-- Profil politikası öğrenci rolüyle çağırır; oturumsuz çağrı kapanır.
REVOKE ALL ON FUNCTION public.profile_link_exists(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_link_exists(uuid, uuid) TO authenticated, service_role;

-- 5) Sıralamanın tamamı tek istekte çekilmesin.
CREATE OR REPLACE FUNCTION public.star_leaderboard(p_scope text, p_period text, p_limit integer DEFAULT 20)
RETURNS TABLE (rank bigint, label text, detail text, students bigint, stars bigint, is_me boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH d AS (
    SELECT
      CASE p_period
        WHEN 'week' THEN public.stars_week_start(public.stars_today())
        WHEN 'last_week' THEN public.stars_week_start(public.stars_today()) - 7
        ELSE DATE '2000-01-01'
      END AS from_day,
      CASE p_period
        WHEN 'last_week' THEN public.stars_week_start(public.stars_today())
        ELSE DATE '9999-12-31'
      END AS to_day
  ),
  me AS (SELECT p.id, p.school_id FROM public.profiles p WHERE p.id = auth.uid()),
  lim AS (SELECT least(greatest(coalesce(p_limit, 20), 1), 100) AS n),
  totals AS (
    SELECT e.user_id, sum(e.amount)::bigint AS stars
      FROM public.star_events e, d
     WHERE e.day >= d.from_day AND e.day < d.to_day
     GROUP BY e.user_id
  ),
  people AS (
    SELECT t.user_id, t.stars, p.school_id, p.full_name, p.stars_hidden
      FROM totals t JOIN public.profiles p ON p.id = t.user_id
  ),
  users_ranked AS (
    SELECT row_number() OVER (ORDER BY pe.stars DESC, pe.user_id) AS rank, pe.*
      FROM people pe
     WHERE p_scope IN ('school', 'country')
       AND (pe.stars_hidden = false OR pe.user_id = (SELECT id FROM me))
       AND (p_scope = 'country'
            OR ((SELECT school_id FROM me) IS NOT NULL AND pe.school_id = (SELECT school_id FROM me)))
  ),
  schools_ranked AS (
    SELECT row_number() OVER (ORDER BY sum(pe.stars) DESC, pe.school_id) AS rank,
           pe.school_id, sum(pe.stars)::bigint AS stars
      FROM people pe
     WHERE p_scope = 'schools' AND pe.school_id IS NOT NULL
     GROUP BY pe.school_id
  )
  SELECT u.rank, public.star_display_name(u.full_name), s.name, NULL::bigint, u.stars,
         u.user_id = (SELECT id FROM me)
    FROM users_ranked u LEFT JOIN public.schools s ON s.id = u.school_id
   WHERE u.rank <= (SELECT n FROM lim) OR u.user_id = (SELECT id FROM me)
  UNION ALL
  SELECT r.rank, s.name, NULL::text,
         (SELECT count(*) FROM public.profiles p WHERE p.school_id = r.school_id), r.stars,
         r.school_id = (SELECT school_id FROM me)
    FROM schools_ranked r JOIN public.schools s ON s.id = r.school_id
   WHERE r.rank <= (SELECT n FROM lim) OR r.school_id = (SELECT school_id FROM me)
   ORDER BY 1
$$;
REVOKE ALL ON FUNCTION public.star_leaderboard(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.star_leaderboard(text, text, integer) TO authenticated, service_role;

-- 6) Emekli bölümlerin ve iç işlerin SECURITY DEFINER fonksiyonları oturumsuz çağrılamaz.
--    Var olmayan fonksiyon atlanır (yerel kurulumlar farklı olabilir).
DO $$
DECLARE
  f text;
  closed text[] := ARRAY[
    'public.puzzle_submit', 'public.puzzle_leaderboard', 'public.puzzle_my_day',
    'public.user_app_feed', 'public.increment_user_app_view', 'public.referral_multiplier',
    'public.account_verified', 'public.referral_counted', 'public.increment_prep_view'
  ];
  r record;
BEGIN
  FOREACH f IN ARRAY closed LOOP
    FOR r IN
      SELECT p.oid::regprocedure AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname || '.' || p.proname = f
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    END LOOP;
  END LOOP;
END $$;
