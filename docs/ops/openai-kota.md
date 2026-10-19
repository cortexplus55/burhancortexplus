# OpenAI kota / hız sınırı

## Belirti
- Dersler, testler, podcast'ler art arda "oluşturulamadı"; `/admin/ders-hatalari`'nda aynı dakikada çok
  kayıt.
- Vercel → Logs'ta `429` (`rate_limit_exceeded` ya da `insufficient_quota`) ya da `5xx`/zaman aşımı.
- `/admin/ai-kullanimi`'nda kullanım sıçraması; `/admin/maliyetler`'de günlük gider beklenenin üstünde.

## Bakılacak yer
- OpenAI paneli (ürün sahibinin hesabı): kullanım katmanı, dakikalık jeton (TPM) ve istek (RPM) sınırı,
  aylık bütçe, ödeme yöntemi. Bir ders ~5-8 bin jeton; yoğun saatte sınır TPM'dir.
- Kodda: 429/5xx/zaman aşımı **aynı rezervasyonla** yeniden denenir (`src/lib/ai/transient-retry.ts`,
  `generate.ts`); denemeler biterse içerik gösterilmez, kredi iade edilir, `lesson_generation_failures`
  kaydı düşer. Yani öğrenci kredi kaybetmez, zaman kaybeder.
- Hızlı işlem (`service_tier: "fast"`, kayıtta `gpt-6-luna-fast`) yalnız öğrenci beklerken; önceden
  yazım normal işlemde (`teacher-tier.ts`). Maliyet sıçramasında önce buna bak.

## İşlem
1. `insufficient_quota` ise bütçe/ödeme bitmiştir: OpenAI panelinde bütçeyi yükselt ya da ödeme yöntemini
   düzelt — başka çözüm yok; düzelince üretimler kendiliğinden geçer.
2. `rate_limit_exceeded` ise anlıktır: 1-2 dk sonra yeniden dener; sürüyorsa OpenAI'dan katman/limit
   artışı iste. Kuyruk ve geri basınç henüz yok (plan 3.2) — aynı anda N üretim sınırı gelene kadar yoğun
   saatte düşme olabilir.
3. Öğrenciye: "Birkaç dakika sonra yeniden dene; kredin düşmedi" — `/krediler`'den doğrulat.
4. Düşen dersleri toplu yeniden yazdırma yok; öğrenci açınca yeniden üretilir (hazır içerik yoksa hızlı
   işlemle).

## Önleme
- Plan 3.2: üretim kuyruğu; 3.5: 1000 öğrenci için maliyet modeli. Haftalık `/admin/maliyetler`.
- Modeli ya da işlem katmanını değiştirirken `ai_model_prices`'ı güncelle, yoksa gider yanlış hesaplanır.

**Üretim yuvaları (19 Ekim 2026):** 429 dalgasını önlemek için aynı anda en çok `GENERATION_SLOTS` (varsayılan
40) içerik üretimi çalışır. Dolu kapıda öğrenci hata değil "Şu an yoğunluk var; sıradasın" görür, ekran ~3 dk
kendiliğinden yeniden dener; önceden yazım yuvaların %70'i dolunca hiç başlamaz. `/admin/sistem` → "Üretim
yuvaları: şu an X / Y". OpenAI katmanı yükselirse sınırı Vercel'de artırın; 429 artıyorsa düşürün. Kayıtta
`generation_busy` satırları sıranın dolduğunu gösterir.
