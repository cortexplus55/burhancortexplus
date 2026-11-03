-- GATE v14 katman 5 (3 Kasım 2026): canlı istatistiksel karantina. Yalnız ekleme: fonksiyon + pg_cron işi.
-- Doğrulanmış havuz sorusu şu durumda 'stale' olur (öğrenciye sunulmaz; serve.ts yalnız 'verified' okur):
--   a) ≥10 yanıt ve doğru oranı < %20 (anahtar büyük olasılıkla yanlış); ya da
--   b) ≥2 farklı öğrenciden bildirim (question_reports.question_snapshot->>'poolItemId'), denetim 'invalid' demediyse.
-- Gerekçe qa.quarantine içine yazılır; geri almak: status='verified' + qa - 'quarantine'.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.quarantine_pool_items(min_responses integer DEFAULT 10, min_reports integer DEFAULT 2, low_rate numeric DEFAULT 0.20)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  moved integer;
BEGIN
  WITH stats AS (
    SELECT item_id, count(*)::int AS n, avg(CASE WHEN correct THEN 1 ELSE 0 END)::numeric AS rate
    FROM public.item_responses
    GROUP BY item_id
  ),
  reports AS (
    SELECT (question_snapshot->>'poolItemId')::uuid AS item_id, count(DISTINCT user_id)::int AS r
    FROM public.question_reports
    WHERE question_snapshot ? 'poolItemId'
      AND question_snapshot->>'poolItemId' ~* '^[0-9a-f-]{36}$'
      AND verdict <> 'invalid'
    GROUP BY 1
  ),
  hits AS (
    SELECT b.id,
           s.n, s.rate, coalesce(rp.r, 0) AS r,
           CASE WHEN coalesce(rp.r, 0) >= min_reports THEN 'reports' ELSE 'low_correct_rate' END AS rule
    FROM public.item_bank b
    LEFT JOIN stats s ON s.item_id = b.id
    LEFT JOIN reports rp ON rp.item_id = b.id
    WHERE b.status = 'verified'
      AND (coalesce(rp.r, 0) >= min_reports OR (coalesce(s.n, 0) >= min_responses AND s.rate < low_rate))
  )
  UPDATE public.item_bank b
  SET status = 'stale',
      qa = b.qa || jsonb_build_object('quarantine', jsonb_build_object(
        'at', now(), 'rule', h.rule, 'responses', coalesce(h.n, 0), 'correct_rate', h.rate, 'reports', h.r, 'gate_version', 14))
  FROM hits h
  WHERE b.id = h.id;
  GET DIAGNOSTICS moved = ROW_COUNT;
  RETURN moved;
END;
$$;

REVOKE ALL ON FUNCTION public.quarantine_pool_items(integer, integer, numeric) FROM PUBLIC, anon, authenticated;

-- Saatte bir (dakika 17). Aynı adla yeniden kurulursa önce kaldırılır.
DO $$
BEGIN
  PERFORM cron.unschedule('quarantine-pool-items') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'quarantine-pool-items');
  PERFORM cron.schedule('quarantine-pool-items', '17 * * * *', 'SELECT public.quarantine_pool_items()');
END;
$$;
