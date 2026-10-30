-- Büyük belgede hızlı başlatma (31 Ekim 2026): belgenin ilk okunan sayfalarının gizli baş kopyası (document-head.ts).
-- Baş kopyası ana belgenin dosyasını paylaşır; ana belge silinince satırı da gider (CASCADE). Listeler (Belgelerim,
-- stüdyo, sohbet) part_of olan satırı göstermez. Yalnız ekleme: kod sütun yokken hızlı başlatmayı kapatır.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS part_of uuid REFERENCES public.documents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS documents_part_of_idx
  ON public.documents (part_of)
  WHERE part_of IS NOT NULL;
