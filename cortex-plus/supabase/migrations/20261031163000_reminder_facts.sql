-- 31 Ekim 2026 (lansman zırhı): günlük çalışma hatırlatmasının sayıları SQL'de toplanır.
--
-- Cron (api/cron/study-reminders) düğümleri, denemeleri ve günü gelen tekrarları satır satır okuyordu. PostgREST bir
-- sorguda en çok 1.000 satır döndürür: 100 hazırlığın düğümleri (~60'ar) ya da öğrencilerin denemeleri bu sınırı
-- aşınca liste sessizce kesiliyor, bitmemiş yolu olan öğrenci "yolu bitmiş" sayılıp hatırlatma almıyordu. Üç küçük
-- fonksiyon aynı bilgiyi hazırlık/öğrenci başına tek satırla verir. Cron sayfa sayfa (100'er hazırlık) çağırır;
-- fonksiyon yoksa eski sorgulara düşer.
--
-- Eklemeli: yeni fonksiyonlar, yalnız service_role, DROP yok.

CREATE OR REPLACE FUNCTION public.reminder_unfinished_preps(p_prep_ids uuid[])
RETURNS TABLE (exam_prep_id uuid) AS $BODY$
  SELECT DISTINCT n.exam_prep_id
  FROM public.exam_prep_nodes n
  WHERE n.exam_prep_id = ANY (p_prep_ids)
    AND n.status <> 'done';
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.reminder_unfinished_preps(uuid[]) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.reminder_unfinished_preps(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reminder_unfinished_preps(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.reminder_last_activity(p_user_ids uuid[])
RETURNS TABLE (user_id uuid, last_at timestamptz) AS $BODY$
  SELECT a.user_id, max(a.updated_at)
  FROM public.exam_prep_node_attempts a
  WHERE a.user_id = ANY (p_user_ids)
  GROUP BY a.user_id;
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.reminder_last_activity(uuid[]) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.reminder_last_activity(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reminder_last_activity(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.reminder_due_reviews(p_prep_ids uuid[], p_day date)
RETURNS TABLE (exam_prep_id uuid, due integer) AS $BODY$
  SELECT r.exam_prep_id, count(*)::integer
  FROM public.exam_prep_review_items r
  WHERE r.exam_prep_id = ANY (p_prep_ids)
    AND r.status = 'active'
    AND r.due_on <= p_day
  GROUP BY r.exam_prep_id;
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.reminder_due_reviews(uuid[], date) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.reminder_due_reviews(uuid[], date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reminder_due_reviews(uuid[], date) TO service_role;
