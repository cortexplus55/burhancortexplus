-- Hazırlığı sil (1 Ekim 2026, Astra'daki "Sınav hazırlığı silinsin mi?").
--
-- exam_preps'e bağlı tabloların çoğu ON DELETE CASCADE. Üçü değil (NO ACTION),
-- canlı veritabanından okundu:
--   exam_preps.forked_from          başkasının bu hazırlıktan aldığı kopya
--   flashcard_reviews.exam_prep_id  öğrencinin kart tekrarları
--   practice_exams.exam_prep_id     bu hazırlığın yazılı denemeleri
-- Kopyalar başkasına ait: silinmez, yalnız bağ kopar. Kart tekrarları
-- öğrencide kalır, bağ kopar. Denemeler hazırlığın parçası: silinir.
-- Hepsi tek işlemde; yarım silme olmaz. Yalnız sunucu (service_role) çağırır.

CREATE OR REPLACE FUNCTION public.delete_exam_prep(p_prep_id uuid, p_user_id uuid)
RETURNS boolean AS $BODY$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_preps WHERE id = p_prep_id AND user_id = p_user_id
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.exam_preps SET forked_from = NULL WHERE forked_from = p_prep_id;
  UPDATE public.flashcard_reviews SET exam_prep_id = NULL WHERE exam_prep_id = p_prep_id;
  DELETE FROM public.practice_exams WHERE exam_prep_id = p_prep_id;
  DELETE FROM public.exam_preps WHERE id = p_prep_id AND user_id = p_user_id;
  RETURN true;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.delete_exam_prep(uuid, uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.delete_exam_prep(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_exam_prep(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_exam_prep(uuid, uuid) TO service_role;
