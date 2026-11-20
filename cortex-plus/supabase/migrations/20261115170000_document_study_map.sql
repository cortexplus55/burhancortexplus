-- UYGULANDI: 15 Kasım 2026, Burhan onayıyla SQL ekranında (kayıt satırıyla); docs/operasyon/goc-kayitlari.md.
--
-- 15 Kasım 2026 (PROMPT-V2 §4, Faz 13 PR-3): belge haritası belgenin kendi kaydında. Harita modelsiz hesaplanır
-- (bölüm başlıkları ve sayfa aralıkları, tahmini ağırlık, formüller, notun özel sayısal kuralları, uzlaşımlar;
-- src/lib/documents/document-map.ts) ve bir kez yazılır; öğretmen ve plan yalnız bunu okur, vektör araması yapmaz.
--
-- Yalnız ekleme: yeni, boş bırakılabilir bir sütun. Var olan satırların hiçbir değeri değişmez (sütun NULL başlar,
-- harita ilk ihtiyaçta arka planda doldurulur). İndeks yok: sütun yalnız belgenin birincil anahtarıyla okunur.
-- Kod sütun yokken de çalışır (haritayı hesaplar, sunucu belleğinde tutar).
--
-- Geri alma: ALTER TABLE public.documents DROP COLUMN study_map; (yalnız Burhan; harita yeniden hesaplanabilir veridir)

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS study_map jsonb;

COMMENT ON COLUMN public.documents.study_map IS
  'Belge haritası (teacher.v2): bölümler, ağırlık, formüller, notun kuralları, uzlaşımlar. Modelsiz, yeniden hesaplanabilir.';
