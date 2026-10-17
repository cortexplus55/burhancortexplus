-- ============================================================================
-- Yıldızlar (17 Ekim 2026, ürün sahibinin kararı: Astra'daki gibi)
--
-- Astra'da canlı bakıldı: üst çubukta "Yıldızlar: bugün 11 / 50"; pencerede bu
-- haftanın yıldızları, Okul arkadaşları / Türkiye / Okullar sıralaması, Bu hafta /
-- Tüm zamanlar, "Nasıl yıldız kazanılır" listesi. Bizde okul maçı ve günlük bulmaca
-- yok; onların yerine düello sayılıyor.
--
-- Her kazanç tek satır; (öğrenci, kaynak, ref) bir kez yazılır, aynı test iki kez
-- yıldız vermez. Yazma yalnız sunucudan (award_stars, service_role). Günlük hedef
-- (günde 50 → +25), haftalık seri (5 günde hedef → +100) ve davet (davet edilen
-- 3 ayrı günde yıldız kazanınca davet eden +100, kendisi +50) aynı fonksiyonda.
--
-- Sıralamada ad + soyadın baş harfi + okul görünür; öğrenci profiles.stars_hidden
-- ile kendini başkalarının listesinden çıkarabilir (ürün sahibinin kararı).
--
-- Tamamen additive. Editör notu: satır sonunda çıplak THEN bırakmayın. Tablo yeni
-- olduğu için DROP POLICY yok; panel onu "yıkıcı işlem" sayıp onay istiyor.
-- 17 Ekim 2026'da SQL editöründe bu hâliyle çalıştırıldı.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.star_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source text NOT NULL,
  amount integer NOT NULL,
  ref text NOT NULL,
  day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT star_events_amount_check CHECK (amount BETWEEN 1 AND 500),
  CONSTRAINT star_events_source_check CHECK (source IN (
    'prep', 'duel', 'chat', 'daily_goal', 'weekly_streak',
    'invite', 'invite_welcome', 'invite_subscribed', 'prep_joined'
  )),
  CONSTRAINT star_events_once UNIQUE (user_id, source, ref)
);

CREATE INDEX IF NOT EXISTS star_events_user_day_idx ON public.star_events (user_id, day);
CREATE INDEX IF NOT EXISTS star_events_day_idx ON public.star_events (day);

ALTER TABLE public.star_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY star_events_own ON public.star_events FOR SELECT USING (user_id = auth.uid());

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stars_hidden boolean NOT NULL DEFAULT false;

-- İstanbul günü ve haftası (pazartesi başlar).
CREATE OR REPLACE FUNCTION public.stars_today() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (timezone('Europe/Istanbul', now()))::date $$;

CREATE OR REPLACE FUNCTION public.stars_week_start(p_day date) RETURNS date
LANGUAGE sql IMMUTABLE AS $$ SELECT (p_day - (extract(isodow FROM p_day)::int - 1))::date $$;

-- "Ahmet Emre Yılmaz" → "Ahmet Y."; boşsa "Öğrenci".
CREATE OR REPLACE FUNCTION public.star_display_name(p_full text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN coalesce(btrim(p_full), '') = '' THEN 'Öğrenci'
    WHEN position(' ' IN btrim(p_full)) = 0 THEN btrim(p_full)
    ELSE split_part(btrim(p_full), ' ', 1) || ' ' || upper(left(regexp_replace(btrim(p_full), '^.* ', ''), 1)) || '.'
  END
$$;

-- Kazanç yazar; bonusları ekler; verilen toplamı döner (tekrar çağrı 0 döner).
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

  -- Günlük hedef: bir günde 50 yıldız (bonuslar sayılmaz) → +25.
  SELECT coalesce(sum(amount), 0) INTO v_today
    FROM public.star_events
   WHERE user_id = p_user AND day = v_day AND source NOT IN ('daily_goal', 'weekly_streak', 'invite_welcome');
  IF v_today >= 50 THEN INSERT INTO public.star_events (user_id, source, amount, ref, day)
    VALUES (p_user, 'daily_goal', 25, v_day::text, v_day)
    ON CONFLICT ON CONSTRAINT star_events_once DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_awarded := v_awarded + 25;
      -- Haftalık seri: haftanın 5 gününde günlük hedef → +100.
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

  -- Davet: davet edilen 3 ayrı günde yıldız kazanınca davet eden +100, kendisi +50.
  SELECT referred_by INTO v_inviter FROM public.profiles WHERE id = p_user;
  IF v_inviter IS NOT NULL AND v_inviter <> p_user THEN SELECT count(DISTINCT day) INTO v_star_days
      FROM public.star_events
     WHERE user_id = p_user AND source NOT IN ('invite_welcome', 'daily_goal', 'weekly_streak');
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

-- Öğrencinin kendi yıldızları: bugün (hedefe sayılan), bu hafta, tüm zamanlar, kaynaklar.
CREATE OR REPLACE FUNCTION public.my_stars() RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS id),
       d AS (SELECT public.stars_today() AS today, public.stars_week_start(public.stars_today()) AS week)
  SELECT jsonb_build_object(
    'today', (SELECT coalesce(sum(e.amount), 0) FROM public.star_events e, me, d
               WHERE e.user_id = me.id AND e.day = d.today
                 AND e.source NOT IN ('daily_goal', 'weekly_streak', 'invite_welcome')),
    'week', (SELECT coalesce(sum(e.amount), 0) FROM public.star_events e, me, d
              WHERE e.user_id = me.id AND e.day >= d.week),
    'all', (SELECT coalesce(sum(e.amount), 0) FROM public.star_events e, me WHERE e.user_id = me.id),
    'sourcesWeek', (SELECT coalesce(jsonb_object_agg(s.source, s.total), '{}'::jsonb) FROM (
                      SELECT e.source, sum(e.amount) AS total FROM public.star_events e, me, d
                       WHERE e.user_id = me.id AND e.day >= d.week GROUP BY e.source) s),
    'sourcesAll', (SELECT coalesce(jsonb_object_agg(s.source, s.total), '{}'::jsonb) FROM (
                     SELECT e.source, sum(e.amount) AS total FROM public.star_events e, me
                      WHERE e.user_id = me.id GROUP BY e.source) s),
    'hidden', (SELECT coalesce(p.stars_hidden, false) FROM public.profiles p, me WHERE p.id = me.id),
    'hasSchool', (SELECT p.school_id IS NOT NULL FROM public.profiles p, me WHERE p.id = me.id)
  )
$$;

REVOKE ALL ON FUNCTION public.my_stars() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_stars() TO authenticated, service_role;

-- Sıralama. p_scope: school (okul arkadaşları) | country (Türkiye) | schools (okullar).
-- p_period: week | last_week | all. İlk p_limit satır + çağıranın kendi satırı.
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
   WHERE u.rank <= greatest(p_limit, 1) OR u.user_id = (SELECT id FROM me)
  UNION ALL
  SELECT r.rank, s.name, NULL::text,
         (SELECT count(*) FROM public.profiles p WHERE p.school_id = r.school_id), r.stars,
         r.school_id = (SELECT school_id FROM me)
    FROM schools_ranked r JOIN public.schools s ON s.id = r.school_id
   WHERE r.rank <= greatest(p_limit, 1) OR r.school_id = (SELECT school_id FROM me)
   ORDER BY 1
$$;

REVOKE ALL ON FUNCTION public.star_leaderboard(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.star_leaderboard(text, text, integer) TO authenticated, service_role;
