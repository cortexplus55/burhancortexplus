-- Hazırlık birden fazla belge taşıyabilsin.
-- document_id birincil belge olarak durur. Dizi yoksa kod yalnızca onu okur.

ALTER TABLE public.exam_preps
  ADD COLUMN IF NOT EXISTS source_document_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.exam_preps.source_document_ids IS
  'Hazırlığa bağlı belgeler. Kapsam listesi ve öğretmen notu bunların birleşimidir.';
