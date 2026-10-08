# Kredi sistemi v2 (8 Ekim 2026)

Ürün sahibinin kararı: Astra tarzı tek sayaç, **Astra'dan daha fazla kullanım**,
yoğun öğrencide **%50 kâr**. Sayılar canlıda ölçüldü; tahmin yok.

Kodda tek kaynak: `cortex-plus/src/lib/credits/price-table.ts` (özet) ve
göç `20261008120000_credit_system_v2.sql` (asıl). Bekçi:
`tests/unit/credit-system-v2.test.ts` (göçü PGlite'ta çalıştırır).

## Ölçülenler (8 Ekim 2026)

| | Değer | Kaynak |
|---|---|---|
| Dolar | ₺49,22; hesapta **₺52** (yükselişe pay) | piyasa |
| KDV | %20, fiyata dahil | |
| PayTR komisyonu | **%2,95**, vergiler dahil | PayTR Mağaza Paneli → Bilgi |
| Satıştan kalan | fiyatın **%80,4'ü** | |
| Astra Plus, 1 sohbet mesajı | aylık hakkın **%0,05'i** → ayda ≈ **2.000 mesaj** | Profil → Kullanım, `bucket.usedPercent` 13,76 → 13,81 |
| Astra Plus, 1 ders | aylık hakkın **%0,26–0,45'i** → ayda ≈ **220–380 ders** | aynı yerden, 13,81 → 14,26 |
| Astra fiyatı | Plus ₺599/ay (yıllıkta ₺250/ay), Sigma ₺1.997/ay | app.astra-ai.co/pay |
| Bizim mesaj (cevap + belge denetimi) | ~$0,003 | `ai_usage_events`, 3 Ekim sonrası |
| Bizim ders | $0,004–0,009 | aynı |
| Bizim test | $0,004 · kartlar $0,0023 | aynı |
| Taranmış sayfa okuma | $0,0056/sayfa | aynı |
| Metinli sayfa temizliği | $0,0014/sayfa | aynı |
| Büyük belgenin konu haritası | gpt-4.1'de 100 sayfada **$0,30**; luna'da ~**$0,007** | yerel altın deneme (211 + 99 sayfa, toplam $0,022) |

## Birim

**1 kredi = $0,001 model maliyeti = ₺0,052.** Her işin kredisi ölçülen
maliyetinden. Öğrenci hakkını hangi işe harcarsa harcasın maliyetimiz hakla
orantılı kalır. Öğrenci sayıyı değil **yüzdeyi** görür (#179).

## İşlem başına kredi

| İşlem | Kod | Kredi |
|---|---|---|
| Sohbet mesajı (standart ve gelişmiş; ikisi de luna) | `AI_CHAT_STANDARD` / `_ADVANCED` | 3 |
| Sesli sohbet turu | `VOICE_TURN` | 6 |
| Ders | `STUDY_PLAN_GENERATE` | 6 |
| Konu testi, tuzak, tekrar, son kontrol, doğru-yanlış, düello | `QUIZ_GENERATE` | 4 |
| Kartlar | `FLASHCARD_GENERATE` | 3 |
| Sözlü deneme | `ORAL_EXAM_GENERATE` | 8 |
| Podcast | `PODCAST_GENERATE` | 12 |
| Yazılı deneme sınavı (değerlendirme dahil) | `PRACTICE_EXAM_GENERATE` | 15 |
| Fotoğraftan soru | `IMAGE_SOLUTION` | 10 |
| Belge, metinli sayfa | `DOCUMENT_PAGE_PROCESS` (sayfa başına) | 2 |
| Belge, taranmış sayfa (üstüne) | `DOCUMENT_SCAN_PAGE` | 6 |
| Seslendirme (900 karakter) | `AUDIO_SYNTHESIZE` | 2 |

Konu haritası, kurulum sohbeti ve hazırlık adı haktan düşmez (#249).

## Paketler

| Paket | Fiyat | Hak | Karşılığı | Astra |
|---|---|---|---|---|
| Ücretsiz | — | günde 6 | 1 ders ya da 2 mesaj; toplam 5 sayfa belge, 1 hazırlık | ≈1,5 mesaj/gün |
| Plus haftalık | ₺349 | haftada 2.700 | 900 mesaj / 450 ders | yok |
| **Plus aylık** | **₺599** | **ayda 7.200** | **2.400 mesaj (Astra +%20) / 1.200 ders (3–5 kat)** | 2.000 / 220–380 |
| Plus yıllık | ₺2.990 | ayda 7.200 | aynı | ₺250/ay |
| Sigma aylık / yıllık | ₺1.999 / ₺9.990 | ayda 60.000 | 20.000 mesaj (Astra Sigma +%25) | 8 × Plus |
| Ek paket S / M / L | ₺129 / ₺329 / ₺749 | 1.000 / 2.500 / 5.750 | tam kullanımda bile %50 | |

Hak öğrenciye somut sayıyla anlatılır: "Ayda yaklaşık 2.400 mesaj ya da 1.200
ders" (`allowanceWorkLine`). "Kat" yazılmaz.

## Kâr (KDV, PayTR ve model maliyeti düşülünce)

Normal öğrenci: günde 1 ders + 1 test + 10 mesaj = ayda 1.200 kredi.
Yoğun öğrenci: günde 3 ders + 2 test + 30 mesaj + 1 podcast = ayda 3.840 kredi.

| Paket | Normal | Yoğun | Hak tamamen biterse |
|---|---|---|---|
| Plus aylık | %87 | %58 | %22 |
| Plus haftalık | %95 | %83 | %50 |
| Plus yıllık | %69 | ~%0 | zarar |
| Sigma aylık | %96 | %88 | 60.000'in tamamında zarar (ayda 20.000 mesaj, gerçekçi değil) |

Kararlar (ürün sahibi, 8 Ekim):
- %50 **yoğun öğrenciye** göre (hakkın tamamına göre değil).
- Yıllık Plus ₺2.990 ve aynı hakla kalır (Astra ile aynı fiyat; yıllık
  alanlar her ay yoğun çalışmaz).
- Belge tek sayaçtan; büyük belgenin haritası luna'ya geçti.
- Eski bakiyeler sıfırlandı, herkes yeni dönemle başladı (o gün aktif
  abonelik yoktu; iki öğrencide 4'er eski kredi vardı).
- Sigma 60.000.

Sabit giderler (Vercel, Supabase, alan adı) bu kâra dahil değil.

## Belge nasıl düşer

PDF'te ilk adımda sayfa sayısı × 2 ayrılır; hak yetmezse yettiği kadar sayfa
işlenir (ücretsizdeki 5 sayfa sınırıyla aynı yol). Taranmış sayfa okunduktan
sonra sayfa başına 6 düşer; hakkı aşan resim sayfaları atlanır. PDF dışı
belgede ilk sayfa önden, kalanı işlendikten sonra. Sihirbaz yüklemeden önce
"hakkının yaklaşık %X'i" ya da "ilk N sayfasına yetiyor" der.

## Değişirse

Bir işin maliyeti değişirse önce `ai_usage_events`'ten yeniden ölç (3 Ekim
sonrası, `reservation_id` ile işlem başına topla), sonra göçte ve
`price-table.ts`'te aynı anda değiştir — test ikisini karşılaştırıyor.
