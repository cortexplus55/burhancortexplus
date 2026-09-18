-- Deneme üretimi 4 → 5 kredi.
--
-- Gerekçe, tablonun kendi içindeki tutarsızlık. `credit_rules`'taki gelişmiş
-- modelli eylemler ve bir istekte ürettikleri:
--
--   IMAGE_SOLUTION          5 kredi  → tek soru, tek çözüm
--   PRACTICE_EXAM_GRADE     3 kredi  → hazır cevapları değerlendirme
--   PRACTICE_EXAM_GENERATE  4 kredi  → 20 soruya kadar tam deneme
--
-- Deneme üretimi bu listenin en büyük çıktısı: `/api/learning/exam/generate`
-- tek istekte 20 çoktan seçmeli soruyu şıklarıyla yazıyor (`questionCount`
-- tavanı 20) ve premium hesapta gpt-4o'ya gidiyor — yani en pahalı modelle
-- en uzun çıktı. Tek bir görsel sorusu 5 kredi iken bunun 4 kredi olması
-- ters duruyordu.
--
-- 5, tavanı değil tabanı düzeltiyor: hâlâ IMAGE_SOLUTION ile aynı seviyede,
-- yani "en pahalı iş" sınıfının altına düşmüyor. Daha yükseğe çıkarmak
-- öğrencinin en çok istediği işi cezalandırmak olurdu; deneme çözmek sınav
-- hazırlığının kendisi.
--
-- Arayüz bu sayıyı veritabanından okuyor (`getCreditCost`, /studio/yazili),
-- bu yüzden kodda değişecek bir yer yok.

UPDATE public.credit_rules
   SET credit_cost = 5,
       updated_at  = now()
 WHERE action_code = 'PRACTICE_EXAM_GENERATE';
