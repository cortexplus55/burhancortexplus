-- Hızlı başlatma (31 Ekim 2026, ürün sahibi: "öğrenci 25-30 sn'de hazırlığa girsin, kalan sayfalar arkada işlensin").
-- Kurulumda öğrenci hazır olan materyalle (fotoğraf setinin ilk sayfaları, okunmuş belgeler) hazırlığı kurar;
-- henüz okunmakta olan belgeler bu tabloda hazırlığa bağlı bekler. Hazırlık sayfası onları okutur, haritalar ve
-- "materyal ekle" yolundan (add-source) hazırlığa ekler; eklenen ya da öğrencinin vazgeçtiği satır silinir.
-- Yalnız ekleme: kod tablo yokken de çalışır (bekleyen belge Belgelerim'de kalır, şerit görünmez).

CREATE TABLE IF NOT EXISTS public.exam_prep_pending_materials (
  prep_id uuid NOT NULL REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (prep_id, document_id)
);

CREATE INDEX IF NOT EXISTS exam_prep_pending_materials_user_idx
  ON public.exam_prep_pending_materials (user_id);

-- Satır güvenliği açık, politika yok: yalnız sunucu (service_role) okur ve yazar.
ALTER TABLE public.exam_prep_pending_materials ENABLE ROW LEVEL SECURITY;
