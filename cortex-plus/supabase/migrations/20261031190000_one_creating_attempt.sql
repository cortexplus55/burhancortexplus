-- 31 Ekim 2026 (Paket J2 #9): bir öğrencinin bir adımı için aynı anda yalnız bir "hazırlanıyor" kaydı.
--
-- İki sekmeden (ya da çift tıklamayla) aynı ders, test ya da podcast açılınca her sekme kendi istek kimliğiyle ayrı
-- kayıt ve ayrı kredi ayırması açıyordu: öğrenci aynı içeriğe iki kez ödüyor, iki model zinciri koşuyordu. Rota artık
-- ikinci sekmeye "hazırlanıyor" der ve birincinin sonucunu açar (node/reserve.ts, node/start.ts); bu dizin aynı anda
-- gelen iki isteğin ikisinin birden kayıt açmasını veritabanında kapatır. Takılı kalmış (bayat) kayıt yeni isteği
-- kilitlemez: rota onu "failed" yapıp yenisini açar.
--
-- 31 Ekim'de canlıda yinelenen 'creating' kaydı yoktu (dizin sorunsuz kurulur). Eklemeli: DROP yok.

CREATE UNIQUE INDEX IF NOT EXISTS exam_prep_node_attempts_one_creating
  ON public.exam_prep_node_attempts (user_id, node_id)
  WHERE status = 'creating';
