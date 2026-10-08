-- Ücretsiz katman belge sınırı (3 Ekim 2026, ürün sahibinin kararı).
-- Ücretsiz hesap toplam 5 sayfa işletebilir; fazlası için ücretli plan.
-- `page_count` artık işlenen sayfa sayısı, `source_page_count` dosyanın
-- kendisi: ekranda "Ücretsiz planda ilk 5 sayfa işlendi (211 sayfadan)"
-- yazabilmek için. `scan_pages_skipped`: resim sayfası hakkı dolduğu için
-- okunmayan sayfa sayısı — belge artık bu yüzden reddedilmiyor.
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS source_page_count integer;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS scan_pages_skipped integer NOT NULL DEFAULT 0;
