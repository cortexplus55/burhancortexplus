# Maliyet modeli — 19 Ekim 2026 (satışa hazırlık Faz 3.5)

Kaynak: canlı `ai_usage_events` × `ai_model_prices`, SQL ekranında salt okunur sorgu. Kredi tablosu ve
paketler: `KREDI-SISTEMI.md` (1 kredi = $0,001; işlemin kredisi 3 Ekim ölçümünden). Bugün veri iki
hesaptan (kurucu + deneme); ortalamalar öğrenci davranışını değil **işlem başına** maliyeti gösterir.

> 30 günlük pencere yanıltıyor: Eylül sonundaki gpt-4o / gpt-4.1 çağrıları ortalamayı şişiriyor.
> Aşağıdaki tablo **17 Ekim sonrası** (bugünkü motorlar: luna, öğrenci beklerken hızlı işlem).

## İşlem başına ölçülen model maliyeti (17-19 Ekim)

| İşlem | Kod | İşlem | Ortalama | p90 | Kredi (= $) | Oran |
|---|---|---|---|---|---|---|
| Ders | `STUDY_PLAN_GENERATE` | 16 | $0,0161 | $0,0443 | 6 ($0,006) | **2,7× eksik** |
| Yazılı deneme | `PRACTICE_EXAM_GENERATE` | 4 | $0,0140 | $0,0212 | 15 ($0,015) | yetiyor |
| Podcast metni | `PODCAST_GENERATE` | 5 | $0,0098 | $0,0147 | 12 ($0,012) | yetiyor |
| Konu testi | `QUIZ_GENERATE` | 5 | $0,0059 | $0,0083 | 4 ($0,004) | 1,5× eksik |
| Sohbet mesajı | `AI_CHAT_STANDARD` | 14 | $0,0045 | $0,0060 | 3 ($0,003) | 1,5× eksik |
| Kartlar | `FLASHCARD_GENERATE` | 2 | $0,0023 | — | 3 | yetiyor |
| **Seslendirme** | `AUDIO_SYNTHESIZE` (`TTS_SYNTHESIZE`) | 300 satır, 26.833 karakter | **$0,0167 / 1.000 kr.** | — | **2 / 900 kr. ($0,0022 / 1.000)** | **7,5× eksik** |
| Video (resimler kayda girmiyor) | `VIDEO_GENERATE` | 2 | $0,0025 + resim | — | 280 | muhtemelen yetiyor |

Öğrenciden düşmeyen giderler (30 gün): belge sayfa işleme $2,11 (sayfa başına ~$0,0043), önceden yazım
$0,20, belge temizliği $0,19, konu haritası $0,09.

## Neden saptı

- **Ders:** 18 Ekim'den beri öğrenci beklerken hızlı işlem (jeton fiyatı 2×) ve kavram kavram düzeltme
  turları. Bugünkü yavaş derslerde 15-19 çağrı vardı (p90 $0,044); ezber kodu yüzünden dönen turlar #348
  ile kesildi, ortalama düşmeli. Önceden yazılan ders normal işlemde ve ucuz; öğrencinin açtığı derslerin
  çoğu önceden yazılmış olunca ortalama yine düşer.
- **Ses:** 900 karakter = 2 kredi oranı ses ücretli olduğundan beri (18 Eylül) değişmedi; OpenAI'nin
  kendi tahmini de dakika başına ~$0,015 (900 karakter ≈ 1,2 dk konuşma).
- **Test, mesaj:** iki geçişli test motoru ve belge denetimli sohbet.

## Öğrenci başına ay (bugünkü ölçümle)

| | Normal: günde 1 ders + 1 test + 10 mesaj, haftada 2 podcast | Yoğun: günde 3 ders + 2 test + 30 mesaj + 1 podcast |
|---|---|---|
| Model + ses maliyeti | ~$2,6 | ~$7,9 |
| Düşen kredi | ~1.300 | ~4.000 |
| Plus aylık net gelir (₺599, KDV %20 ve PayTR %2,95 düşülünce, $1 = ₺52) | ~$9,3 | ~$9,3 |
| Marj | **~%72** | **~%15** (hedef %50) |

Ses en büyük risk: hakkının tamamını ses üretimine harcayan bir Plus öğrencisi (7.200 kredi → 3,2 milyon
karakter) ~$54 maliyet çıkarır.

1.000 aktif öğrenci (%70 normal, %30 yoğun): model + ses ~$4.200/ay; Vercel Pro $20 + kullanım
~$50-150; Supabase Pro $25-35; ses depolama birkaç $. Hepsi aylık Plus ise net gelir ~$9.300.

## Karar bekleyenler (ürün sahibi)

1. Ses kredisi: 2 → 15 / 900 karakter (maliyet + %50 yakın) mı, ses podcast'e mi katılsın?
2. Ders kredisi 6 → ~12-16 mı, yoksa #348'in etkisini 1 hafta ölçüp mü karar?
3. Test 4 → 6, mesaj 3 → 5 mi? (Plus'ın "2.400 mesaj / 1.200 ders" vaadi buna göre değişir.)
4. Video resimleri kullanım kaydına yazılsın (ölçülebilsin) — kod işi, karar gerektirmez.
