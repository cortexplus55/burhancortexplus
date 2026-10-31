-- 31 Ekim 2026 (lansman zırhı): iki salt okunur gösterge, yalnız service_role.
--
-- 1) database_size_report(): veritabanının boyutu ve en büyük tablolar. Ücretsiz planda sınır 500 MB; 15 kullanıcı ve
--    198 belgeyle 154 MB'a gelinmişti ve hiçbir yer bunu göstermiyordu (son kayıt 18 Ekim: 49 MB). Sınır aşılınca
--    Supabase veritabanını salt okunur yapar: kayıt, ders, ödeme kaydı yazılamaz. /admin/sistem ve günlük özet okur.
-- 2) ai_usage_totals(p_since): pencerede model başına çağrı ve jeton toplamı. Günlük özetin OpenAI gideri satırı;
--    PostgREST bir sorguda en çok 1.000 satır döndürdüğü için satır satır okumak kalabalık günde eksik sayardı.
--
-- Eklemeli: yeni fonksiyonlar, DROP yok.

CREATE OR REPLACE FUNCTION public.database_size_report()
RETURNS jsonb AS $BODY$
  SELECT jsonb_build_object(
    'total_bytes', pg_database_size(current_database()),
    'tables', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', t.name, 'bytes', t.bytes) ORDER BY t.bytes DESC)
      FROM (
        SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 8
      ) t
    ), '[]'::jsonb)
  );
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.database_size_report() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.database_size_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.database_size_report() TO service_role;

CREATE OR REPLACE FUNCTION public.ai_usage_totals(p_since timestamptz)
RETURNS TABLE (model text, calls bigint, tokens_in bigint, tokens_out bigint) AS $BODY$
  SELECT
    e.model,
    count(*)::bigint,
    COALESCE(sum(e.tokens_in), 0)::bigint,
    COALESCE(sum(e.tokens_out), 0)::bigint
  FROM public.ai_usage_events e
  WHERE e.created_at >= p_since
  GROUP BY e.model;
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.ai_usage_totals(timestamptz) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.ai_usage_totals(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_totals(timestamptz) TO service_role;
