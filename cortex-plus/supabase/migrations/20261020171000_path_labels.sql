-- Yol adımlarının dürüst adları (20 Ekim 2026, ürün sahibinin kararı). Yalnız veri: UPDATE.
--
-- 1) Ek testler "Tekrar testi (karışık)" ve "Zor sorular" diye adlanıyordu; ikisi de kurulmayan bir
--    şeyi vaat ediyordu (tek konunun sayfalarından, öğrencinin seçtiği zorlukta yazılıyorlar). Yeni
--    hazırlıklar "İkinci test" / "Üçüncü test" yazıyor (exam-schedule-v2.ts practiceActivity).
-- 2) "Aralıklı tekrar" adımı bir kart destesi; günü gelen (1-3-7-14 gün) tekrar ayrı bir özellik.
--    Yeni ad "Kartlarla tekrar" (PLAN_NODE_META.spaced). Tür adı (kind = 'spaced') değişmez.
--
-- Kayıtlı başlık "<konu> · <etiket>[ · <kaynak>]" ya da şablonda yalnız etiket. Yeniden planlama
-- düğümleri id, sıra, durum ve session_meta ile karşılaştırıyor; başlık karşılaştırılmıyor, güvenli.
-- Takvim kaydındaki (schedule_v2) eski gerekçe metni yalnız kaynak aramasına giriyor; dokunulmaz.
-- Ayrı "Zor sorular" sayfası (/zor-sorular) bir düğüm değil; bu güncelleme ona dokunmaz.

UPDATE public.exam_prep_nodes
   SET title = replace(title, ' · Tekrar testi (karışık)', ' · İkinci test')
 WHERE kind = 'quiz'
   AND title LIKE '% · Tekrar testi (karışık)%';

UPDATE public.exam_prep_nodes
   SET title = replace(title, ' · Zor sorular', ' · Üçüncü test')
 WHERE kind = 'quiz'
   AND title LIKE '% · Zor sorular%';

UPDATE public.exam_prep_nodes
   SET title = replace(title, ' · Aralıklı tekrar', ' · Kartlarla tekrar')
 WHERE kind = 'spaced'
   AND title LIKE '% · Aralıklı tekrar%';

UPDATE public.exam_prep_nodes
   SET title = 'Kartlarla tekrar'
 WHERE kind = 'spaced'
   AND title = 'Aralıklı tekrar';
