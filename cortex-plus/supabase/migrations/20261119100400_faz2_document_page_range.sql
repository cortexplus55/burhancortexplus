-- Faz 2 (madde 5): büyük PDF sessizce kırpılmaz; öğrenci işlenecek sayfa aralığını seçer.
--
-- Kök neden: ücretsiz sayfa hakkı ya da kredi bittiğinde belgenin yalnız ilk N sayfası okunuyor, kapsam özeti
-- yine "tam" diyordu. Öğrenciye kalan sayfaların okunmadığı söylenmiyor, başka bir aralık seçme yolu da yoktu.
--
-- İki boş sütun (ekleyici, tekrar çalıştırılabilir; var olan belgeler için NULL = "baştan sona", eski davranış):
--   page_range_start — işlenecek ilk sayfa (1'den başlar)
--   page_range_end   — işlenecek son sayfa (dahil)
-- `page_count` anlamı değişmez: İŞLENEN sayfa sayısı (ücretsiz hak bunu sayar). `source_page_count` dosyanın toplam
-- sayfası. İşlenen aralık = page_range_start .. page_range_start + page_count - 1.

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS page_range_start integer;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS page_range_end integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_page_range_valid' AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_page_range_valid CHECK (
        (page_range_start IS NULL OR page_range_start >= 1)
        AND (page_range_end IS NULL OR page_range_end >= coalesce(page_range_start, 1))
      ) NOT VALID;
  END IF;
END $$;
ALTER TABLE public.documents VALIDATE CONSTRAINT documents_page_range_valid;

COMMENT ON COLUMN public.documents.page_range_start IS 'Faz 2: öğrencinin seçtiği ilk sayfa (NULL = 1).';
COMMENT ON COLUMN public.documents.page_range_end IS 'Faz 2: öğrencinin seçtiği son sayfa, dahil (NULL = dosyanın sonu).';
