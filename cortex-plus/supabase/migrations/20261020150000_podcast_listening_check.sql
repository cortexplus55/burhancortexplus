-- Podcast'in dinleme kontrolü (20 Ekim 2026, kör kıyas: podcast'in sonunda soru yoktu).
--
-- Senaryo denetimden geçince test motoru senaryodan üç soru yazar. Sorular denemenin kaydında
-- (exam_prep_node_attempts.payload.check) duruyor; bu sütun aynı konunun önbelleğe giren
-- podcast'i için: "Yeniden dinle" ve hazırlığın podcast sayfasından gelen önbellek de kontrollü
-- (puanlı, kanıtlı) açılsın. Boş sütun: kontrolsüz podcast (eski satırlar, 1 dakikalık özet).
--
-- Yalnız ekleme: boş olabilen yeni sütun. Kod göçten önce de çalışır (okuma `select *`,
-- yazma sütun yoksa sütunsuz yeniden dener).

ALTER TABLE public.exam_prep_podcasts ADD COLUMN IF NOT EXISTS listening_check jsonb;

COMMENT ON COLUMN public.exam_prep_podcasts.listening_check IS
  'Dinleme kontrolü: QuizQuestion[] (en çok 3). Boşsa podcast kontrolsüz.';
