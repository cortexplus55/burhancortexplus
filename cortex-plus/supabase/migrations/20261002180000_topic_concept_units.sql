-- Kavram birimleri (2 Ekim 2026, ürün sahibinin kararı: ana konu + içinde
-- dersler). Konu haritası her ana konuyu 2–6 sayfalık kavram birimlerine
-- böler; çalışma planı her birimi ayrı bir ders yapar. Boş dizi: birim yok,
-- plan eski 3 sayfalık mekanik bölmeye döner.
ALTER TABLE public.document_topic_nodes
  ADD COLUMN IF NOT EXISTS units jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.document_topic_nodes.units IS
  'Kavram birimleri: [{"title": text, "pages": int[]}] — her biri bir ders.';
