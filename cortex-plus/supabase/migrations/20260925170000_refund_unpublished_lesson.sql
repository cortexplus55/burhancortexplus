-- Ders üretildi, kredi kesinleşti, öğrenciye ders açılmadı.
--
-- 25 Eylül 2026, 16:38 ve 16:40 UTC. Hazırlık
-- 0966e8cc-134a-488d-8cae-01b19d2e2207 (Kimya sınav hazırlığı).
-- Bakiye 10 kr'den 8 kr'ye düştü; ekranda ders yoktu.
-- STUDY_PLAN_GENERATE = 2 kr. Düşüş bir kesinleşmiş rezervasyon.
-- credit_refund yalnızca status = pending iken çalışır; committed
-- satırı geri almaz. Bu yüzden credit_adjust_balance.
--
-- İkinci kez çalıştırılırsa aynı idempotency anahtarı yüzünden
-- bakiye yeniden artmaz. Başarısız olup iade edilmiş rezervasyon
-- (status <> committed) seçilmez. Ücretsiz haktan düşen tutar
-- bakiyeye eklenmez; görünen 2 kr ücretli bakiyedir.

DO $$
DECLARE
  rec record;
  paid integer;
BEGIN
  FOR rec IN
    SELECT r.id AS reservation_id,
           r.user_id,
           r.amount,
           r.free_spent
      FROM public.exam_prep_generation_jobs j
      JOIN public.credit_reservations r
        ON r.user_id = j.user_id
       AND (
         r.idempotency_key = j.credit_idempotency_key
         OR r.operation_key = j.credit_idempotency_key
       )
     WHERE j.exam_prep_id = '0966e8cc-134a-488d-8cae-01b19d2e2207'
       AND j.status = 'failed'
       AND j.created_at >= timestamptz '2026-09-25 16:37:00+00'
       AND j.created_at < timestamptz '2026-09-25 16:42:00+00'
       AND r.status = 'committed'
       AND r.action_code = 'STUDY_PLAN_GENERATE'
  LOOP
    paid := rec.amount - rec.free_spent;
    IF paid > 0 THEN
      PERFORM public.credit_adjust_balance(
        rec.user_id,
        paid,
        'lesson-missing-refund:' || rec.reservation_id::text,
        'adjustment',
        'Ders yayınlanmadan STUDY_PLAN_GENERATE kesinleşti (2026-09-25 16:38 UTC)'
      );
    END IF;
  END LOOP;
END $$;
