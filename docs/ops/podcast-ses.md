# Podcast "Ses şu an üretilemedi" dedi, kredi yine de düştü

**Belirti.** Oynatıcı senaryoyu gösteriyor, altında "Ses şu an üretilemedi. Bölümleri transkriptten
okuyabilirsin." yazıyor; `/admin/ai-kullanimi`'nde aynı dakikada `AUDIO_SYNTHESIZE` harcaması var.

**Bakılacak yer.** Vercel → Logs, `podcast/audio` araması. Aynı öğrenciden **birkaç saniye arayla iki
POST** görünür: biri 10-60 sn sürmüş (`credit_reserve` → `lesson_audio` → `storage/.../sign`), öteki
yarım saniyede bitmiş (`credit_reserve` → `credit_claim_operation` → son). Kısa olan "işlem sürüyor"
cevabını almıştır (19 Ekim 2026'da canlıda böyle oldu).

**İşlem.** 19 Ekim 2026'dan beri kod ikinci isteği hata saymıyor: öteki işin bitmesini bekleyip sesi
önbellekten bedava veriyor (`waitForInFlightAudio`, `audio-cache.ts`); oynatıcı da aynı içerik için
ikinci istek atmıyor (`chaptersKey`). Yine görülürse öğrenci sayfayı yenilesin — ses artık önbellekte,
ikinci açılış ücretsiz. Kredi iadesi gerekmez: ses bir kez üretildi ve öğrenci onu dinleyebiliyor.

**Önleme.** Aynı içeriğe aynı ödeme anahtarı doğru (ikinci kez faturalanmasın); ama anahtarı alamayan
istek **düşmez, bekler**. Bekçi: `audio-credits.test.ts` ("aynı ses başka bir istekte üretiliyorsa"),
`podcast-audio-once.test.tsx`.
