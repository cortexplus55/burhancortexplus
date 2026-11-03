-- GATE v14 katman 5 ek kuralı (3 Kasım 2026, ürün sahibi): yüksek ustalıklı öğrencilerin çoğunluğu AYNI yanlış şıkkı
-- seçiyorsa soru karantinaya alınır (anahtar ya da çeldirici büyük olasılıkla hatalı). Yalnız ekleme:
--   1) item_responses.chosen (nullable; eski satırlar NULL kalır, kod sütun yoksa onsuz yazar);
--   2) quarantine_pool_items aynı imzayla genişletilir; eski iki kural (<%20 doğru, ≥2 bildirim) aynen durur.
-- Yüksek ustalık: outcome_mastery α/(α+β) ≥ 0.70 ve n ≥ 3 (sorunun kazanımında, karantina anındaki değer).
-- Kural: soru ≥10 yanıt; chosen kayıtlı yüksek ustalıklı yanıtlayan ≥3; bunların yarıdan fazlası aynı yanlış şık.

ALTER TABLE public.item_responses ADD COLUMN IF NOT EXISTS chosen smallint CHECK (chosen IS NULL OR chosen BETWEEN 0 AND 9);
CREATE INDEX IF NOT EXISTS item_responses_item_idx ON public.item_responses (item_id);

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
  strong AS (
    -- Öğrenci başına sorudaki son kayıtlı seçim; yalnız yüksek ustalıklı öğrenciler.
    SELECT DISTINCT ON (r.item_id, r.user_id) r.item_id, r.user_id, r.chosen, r.correct
    FROM public.item_responses r
    JOIN public.outcome_mastery m ON m.user_id = r.user_id AND m.outcome_id = r.outcome_id
    WHERE r.chosen IS NOT NULL AND m.n >= 3 AND m.alpha / (m.alpha + m.beta) >= 0.70
    ORDER BY r.item_id, r.user_id, r.created_at DESC
  ),
  strong_total AS (
    SELECT item_id, count(*)::int AS k FROM strong GROUP BY item_id
  ),
  strong_wrong AS (
    SELECT DISTINCT ON (item_id) item_id, chosen, count(*)::int AS w
    FROM strong WHERE NOT correct
    GROUP BY item_id, chosen
    ORDER BY item_id, count(*) DESC
  ),
  hits AS (
    SELECT b.id,
           s.n, s.rate, coalesce(rp.r, 0) AS r, st.k, sw.chosen AS wrong_choice, sw.w,
           CASE
             WHEN coalesce(rp.r, 0) >= min_reports THEN 'reports'
             WHEN coalesce(s.n, 0) >= min_responses AND s.rate < low_rate THEN 'low_correct_rate'
             ELSE 'strong_same_wrong'
           END AS rule
    FROM public.item_bank b
    LEFT JOIN stats s ON s.item_id = b.id
    LEFT JOIN reports rp ON rp.item_id = b.id
    LEFT JOIN strong_total st ON st.item_id = b.id
    LEFT JOIN strong_wrong sw ON sw.item_id = b.id
    WHERE b.status = 'verified'
      AND (
        coalesce(rp.r, 0) >= min_reports
        OR (coalesce(s.n, 0) >= min_responses AND s.rate < low_rate)
        OR (coalesce(s.n, 0) >= min_responses AND coalesce(st.k, 0) >= 3 AND sw.w * 2 > st.k)
      )
  )
  UPDATE public.item_bank b
  SET status = 'stale',
      qa = b.qa || jsonb_build_object('quarantine', jsonb_build_object(
        'at', now(), 'rule', h.rule, 'responses', coalesce(h.n, 0), 'correct_rate', h.rate, 'reports', h.r,
        'strong_responders', coalesce(h.k, 0), 'strong_wrong_choice', h.wrong_choice, 'strong_wrong_count', coalesce(h.w, 0),
        'gate_version', 14))
  FROM hits h
  WHERE b.id = h.id;
  GET DIAGNOSTICS moved = ROW_COUNT;
  RETURN moved;
END;
$$;

REVOKE ALL ON FUNCTION public.quarantine_pool_items(integer, integer, numeric) FROM PUBLIC, anon, authenticated;
-- Cron işi (quarantine-pool-items, '17 * * * *') değişmez; aynı fonksiyonu çağırır.
