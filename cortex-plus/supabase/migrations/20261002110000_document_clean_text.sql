-- Temiz metin (2 Ekim 2026, ürün sahibinin kararı). PDF'in metin katmanı
-- bozuk geliyor ("ayrıt etme gücü", "irade sürdürülebilir"); ders bu metni
-- kopyalayınca cümle bozuluyordu. Sayfa ilk ihtiyaçta asıl modelle
-- temizlenir: yazım/tanıma hatası düzelir, sayfa üst/alt bilgisi atılır,
-- tablo korunur, bilgi eklenmez. Ham metin olduğu gibi kalır.
ALTER TABLE public.document_pages ADD COLUMN IF NOT EXISTS clean_text text;
ALTER TABLE public.document_pages ADD COLUMN IF NOT EXISTS clean_model text;
ALTER TABLE public.document_pages ADD COLUMN IF NOT EXISTS cleaned_at timestamptz;
