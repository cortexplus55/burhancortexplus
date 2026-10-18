# Ders hazırlama hızı — 18 Ekim 2026

Ürün sahibi: "bir dersin hazırlanması en az 5 dk sürdü … 10 sn'lere düşürmeliyiz, kaliteden ödün
vermeden … ders oluşturulamadı diyor, nedenini ve sorunları tek tek hallet."

## Ölçülen (canlı, 17 Ekim 20:45 "Kadın Hastalıkları ve Doğum")

| Adım | Süre |
|---|---|
| 1. taslak: şemaya uymayan 486 jetonluk cevap, atıldı (nedeni hiçbir yere yazılmıyordu) | ~40 sn |
| 2. taslak (dersin tamamı tek seferde) | 43 sn |
| Denetim | 22 sn |
| Düzeltme turu 1 — dersin TAMAMI baştan yazılıyordu | 35 + 22 sn |
| Düzeltme turu 2 | 35 + 30 sn |
| Sonuç: tek bir eşik itirazı ("karaciğer enzimi normalin 2 katı") kaldı → bütün ders atıldı, "oluşturulamadı" | |

Yeniden denemede ders 132 sn'de çıktı (yine iki tur; itirazların biri "… belirtmiyor" türünden eksik
ayrıntı). Model çıktısının ~%65'i görünmeyen düşünme jetonu (6.100 jetonun ~4.000'i).

## Kararlar (ürün sahibi, 18 Ekim 2026)

| Soru | Karar |
|---|---|
| OpenAI hızlı işlem (Fast mode, jeton fiyatı 2 kat, ~2 kat hız) | Önce **yalnız Plus**; canlıda ücretsiz öğrencinin ilk ekranı 18,4 sn çıkınca aynı gün **herkese** (öğrenci beklerken; önceden yazım normal işlemde) |
| Ders parça parça açılsın mı | **Evet**: ilk denetlenmiş kavram gelince açılır, gerisi öğrenci okurken |
| Önceden hazırlama genişlesin mi (açılmayan dersin maliyeti bizde) | **Evet** |
| Ölçüm bütçesi | ~0,30 $ (harcanan ~0,22 $) |

## Yeni motor

- **Yazar akışla ve düşük düşünmeyle yazar.** Ölçüm: ilk ekran 6–14 sn'de bitiyor (önce 14–24 sn);
  denetçi düşük düşünmeli taslakta daha fazla sorun bulmadı.
- **Kavram kavram denetim.** Bir kavramın ekranları bitince hemen denetime gider; yazar sonraki
  kavramı yazarken önceki denetlenir.
- **Yalnız sorunlu kavram düzeltilir** (dersin tamamı değil). Model yalnız değiştirdiği ekranı
  döndürürse öbürleri yerinde kalır (`mergePartScreens`).
- **Yazarın itiraz hakkı.** Haksız bulduğu soruna gerekçe yazar; denetçi bir sonraki turda tartar.
  Kod kuralları (`[yapı kuralı]`) itiraz edilemez.
- **Denetçi ayarı.** Eksik ayrıntı tek başına ciddi değil; eşdeğer söyleyiş sorun değil; emin
  olunmayan şey ciddi yazılmaz. Belgesiz derste kılavuz sürümleri arası küçük fark sorun değil.
- **Düzelmeyen kavram atılır**, ders kalanla gider ("Ders hataları": "Kavram atıldı"). İlk kavram
  düzelmezse ders yazılmaz, kredi iade. İlk kavrama iki tur, sonrakilere üç tur (öğrenci okurken).
- **Şıklara sırayla gönderme yasak** (yazar + denetçi + kod; ders ve test motoru): şıklar karışık
  gösteriliyor, "ilk seçenek …" karıştırmadan sonra başka şıkkı gösteriyordu. Bugünkü motorda da
  vardı; altın kıyasta hakemin bulduğu sorunların yarısı buydu.
- **Okunamayan taslak kaydedilir** ("Taslak okunamadı (yeniden yazıldı)") ve bir kez baştan yazılır.

## Parça parça açılış

İlk kavram denetlenince ders kaydı `building: true` ile öğrenciye döner; kalanlar aynı fonksiyonda
(`after`) kayda eklenir. Ekran 1,5 sn'de bir `action: "progress"` sorar. Öğrenci yetişirse
"HAZIRLANIYOR" kartı; ders yazım sürerken bitirilemez. Yazım 120 sn ilerlemezse ders olduğu
kadarıyla kapanır, kredi iade (`lesson-build.ts`). Öğrencinin cevap kaydı ayrı alanlara yazıyor
(`answers`, `content_version`); yazım yalnız `payload`'a dokunur.

## Önceden hazırlama

- Hazırlık kurulunca ilk ders yazılmaya başlar (`requestFirstLessonPrefetch`).
- Bir dersten sonra sıradaki ders hazırlanır; aynı konuda ders kalmadıysa sıradaki konunun ilki.
- Önceden yazım da kavram kavram kayda düşer. Öğrenci yazım sürerken açarsa ders **devralınır**
  (ikinci kez yazılmaz): denetlenmiş kısmı hemen görür, kalanı yazıldıkça gelir; ilk kavram
  çıkmadıysa en çok 20 sn beklenir. Kredi yazım bitince kesinleşir, yazım düşerse iade.
- Önceden yazım normal işlemde (bekleyen öğrenci yok); hızlı işlem yalnız açılışta.

## Altın kıyas (yerel, `tests/unit/_tmp/speed-golden.test.ts`)

Aynı dört ders; bağımsız hakem = bugünkü denetçi, dersin bütününe.

| Ders | Bugünkü motor | Yeni, normal (ilk ekran / tamamı) | Yeni, hızlı — Plus (ilk ekran / tamamı) |
|---|---|---|---|
| KPSS (5 sayfa) | 108 sn | 23,5 / 85 sn · 22 / 35 sn | 13 / 19 sn |
| Pediatri | 54 sn | 17 / 42 sn | 20 / 20 sn |
| Termodinamik | 49 sn | 17 / 27 sn | 13,5 / 16 sn |
| Kadın Doğum (belgesiz) | 169 sn | 20 / 84 sn | 12 / 15 sn |

Hakemin bulduğu ciddi sorun: bugünkü motor 4 derste 2 (ders başına 0,5); yeni motor şık kuralından
sonra 8 derste 2 (0,25). Ders başına model maliyeti: normal 0,3–1,4 sent, hızlı 0,6–1,3 sent.

**10 saniye:** Bu model saniyede ~140–280 jeton yazıyor; bir ders ~5.000 jeton. Dersin tamamı 10
saniyede yazılıp denetlenemez. 10 saniyeye iki yol: ders önceden hazır bekler (açılış 1–2 sn) ya da
ilk kavram ~12–20 sn'de açılır ve gerisi öğrenci okurken gelir.

Fiyat satırı: `ai_model_prices` → `gpt-6-luna-fast` ($0,20 / $1,00, göç `20261018120000`).
Bekçi testler: `lesson-stream-pipeline.test.ts`, `lesson-building-ui.test.tsx`, `lesson-prefetch.test.ts`.
