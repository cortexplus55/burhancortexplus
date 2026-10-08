-- Podcast türleri (1 Ekim 2026): Astra'daki beş tür. Önbellek "length"
-- kolonunda türü tutuyor; eski üç değer (ozet, standart, derin) geçerli kalır.
-- Kolon içi CHECK'in adı ortamdan ortama değişebilir, o yüzden adıyla değil
-- tanımıyla bulunup kaldırılır.

DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.exam_prep_podcasts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%length%'
  LOOP
    EXECUTE format('ALTER TABLE public.exam_prep_podcasts DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.exam_prep_podcasts
  ADD CONSTRAINT exam_prep_podcasts_length_check
  CHECK (length IN ('ozet', 'standart', 'derin', 'diyalog', 'soru_cevap', 'basit'));
