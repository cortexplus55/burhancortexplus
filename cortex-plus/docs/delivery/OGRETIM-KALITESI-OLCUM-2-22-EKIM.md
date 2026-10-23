# Öğretim kalitesi — ikinci kör ölçüm (22–23 Ekim 2026)

Soru (ürün sahibi): "Bir kullanıcı bize geldiğinde gerçekten Cortex Plus Astra'dan iyi öğretiyor diyebilir mi?"

**Kısa cevap: henüz her alanda değil.** Doğrulukta ve sınava hazırlıkta açık ara öndeyiz; öğrencinin
okurken hissettiği tarafta (anlaşılırlık, akıcılık, akılda kalma) ve podcast'te Astra hâlâ önde.

## Nasıl ölçüldü

- PR #387'deki beş düzeltmeden **sonra** üretilmiş yeni Cortex içeriği (canlıdan, 22 Ekim), aynı belgelerden
  Astra içeriğiyle yan yana. On çift: üç KPSS, üç Pediatri, üç trigonometri dersi (+ konu testi), bir podcast.
- Ürün adları gizli, biçim eşitlenmiş. Her çift **iki sırayla** (önce A sonra B, önce B sonra A) ayrı yargıçlara.
  Dört göz: öğrenme bilimi, sınav koçu, öğrenci (19-23 yaş, konuyu bilmiyor), kaynağa sadakat.
- Ortak kaynaklı beş çiftte ayrıca "öğrenci" ajanları: yalnız bir ürünün malzemesini okuyup, kaynaktan yazılmış
  15 soruluk sınava girdiler. Her cevap malzemeden birebir alıntıyla; alıntı yoksa geçersiz.

## Sonuç tablosu (80 yargı: 10 çift × 2 sıra × 4 göz)

| Göz | Cortex kazandı | Astra kazandı | Berabere | Ortalama puan (Cortex / Astra) |
|---|---|---|---|---|
| Kaynağa sadakat | 20 | 0 | 0 | 81,7 / 58,8 |
| Sınav koçu | 18 | 2 | 0 | 70,3 / 56,0 |
| Öğrenme bilimi | 12 | 6 | 2 | 59,7 / 55,5 |
| Öğrenci | 4 | 12 | 4 | 60,1 / 65,6 |

İki sıra arasında sonuç hemen hep aynı çıktı; sıra etkisi küçük.

**Podcast (tek çift):** Astra öğrenme, sınav ve öğrenci gözünde iki sırada da önde (Cortex 45-58, Astra 60-73);
sadakatte biz öndeyiz.

**Öğrenci sınavı (ortak kaynaklı beş çift, 15'er soru):**

| Çift | Cortex malzemesi | Astra malzemesi | Hiç çalışmamış |
|---|---|---|---|
| Pediatri büyüme | 15 | 12 | 0 |
| Pediatri beslenme | 15 | 3 | 0 |
| KPSS kuvvetler | 10 | 6 | 0 |
| KPSS demokratik devlet | 14 | 8 | 0 |
| Trigonometri özel açılar | 8 | 3 | 0 |

Hiçbir öğrenci yanlış cevap vermedi; fark "bilmiyorum" sayısından. Dikkat: Astra'nın bazı dersleri belgenin aynı
bölümünü değil komşusunu anlatıyordu (beslenme çiftinde Astra'nın dersi büyüme/alarm konusuydu); bu sayı kısmen
"belgedeki bilgiyi ne kadar kapsıyor" ölçüsüdür.

## Birinci turdan (20 Ekim) bu yana

| 20 Ekim sorunu | Durum | Kanıt |
|---|---|---|
| İkinci soru başka bilgiyi soruyor, doğru cevap yanlış sayılıyor | Düzeldi | Anahtar hatası yok; yeni sorun: 30 ikinci sorunun 5'i ana sorunun neredeyse aynısı |
| Testte tablo satırları tek kalıpla | İyileşti | Sınav gözünde 20 yargının 18'i bizden yana; kalan: aynı testte iki aynı soru, kökün cevabı vermesi |
| Pediatri derslerinde öğretimde geride | İyileşti | 20 Ekim iki sırada Astra; bugün berabere/karışık |
| Yer tutucu başlık, şıklara sırayla gönderme | Düzeldi | Hiçbir yargıçta geçmiyor |
| Podcast robot gibi | Değişmedi | Üç gözde Astra önde; "sesli okunan bilgi kartı destesi", "Evet;/Hayır; kalıbı" |

## Hâlâ geride olduğumuz yer — yargıçların ortak cümleleri

1. **Tekrar.** Aynı bilgi ekran, kutu, özet ve testte dört beş kez ("aynı YSK paragrafı üç ekranda").
2. **Kaynağın kopyası gibi.** Neden/nasıl yok; "Genel oy için verilen bilgi 1934 yılıdır" gibi kaynağın biçimini
   anlatan cümleler; "Notlarda … belirtiliyor".
3. **Örnek vaka vaka değil.** Kutu, kuralı "bir kişi …" diye yeniden söylüyor.
4. **İkinci soru telafi etmiyor.** Doğru/yanlışta öğrencinin az önce "Doğrusu" diye okuduğu cümle yeniden soruluyor.
5. **Kuru öğüt.** Ekranlar "şunu değerlendirirken şuna bak" diye açılıyor.
6. **Podcast.** Evet/hayır soruları, "Hayır; …" açılışları, bağlamsız "Bu konu sınavda ağırlıklı." satırı —
   bu son satırı **kodun kendisi** istiyordu ("Bunu bir cümlede açıkça söyle").

## Bu turda yapılan (feat/ogretim-kalitesi-2)

| Ne | Nasıl | Nerede |
|---|---|---|
| Ekranlar arası tekrar | Kod işaretler (öğretim önemi): önceki ekranın cümlesinin %85'i aynıysa, tablo satırlarının yarısı önceki tabloda varsa | `repetitionIssues` |
| Sahte vaka | Vakanın sözcüklerinin %80'i zaten anlatılmışsa işaret; ölçütün 10. maddesi denetçiye de | `repetitionIssues`, `TEACHING_RUBRIC` |
| Kaynağa gönderme | "notlarda", "kaynakta", "belgede", "için verilen bilgi" işaretlenir (genel bilgi kutusu hariç) | `sourceFrameIssue` |
| İkinci soru = ana soru | Sayıları aynı ve içerik sözcüklerinin %85'i ortaksa ya da doğru/yanlışın "Doğrusu" cümlesiyse reddedilir (çalışma anı da aynı listeye bakar) | `nearSameQuestion`, `reviewItemProblems` |
| Ölçüt | Aynı tablo/paragraf ikinci ekranda yok; "Bir öğrenci … savunuyor" durum değil; çözümlü örnek adım gösterir; kaynağı anma; öğüt ekranda en çok bir cümle | `teaching-rubric.ts` (yazar + düzeltici + denetçi aynı metin) |
| Podcast | "Evet;/Hayır;" açılışı yasak (yazar + denetçi); 3+ satırda kod işaretler; diyalogda Kerem'in sıralarının %60'tan fazlası soruysa işaret; bağlamsız sınav satırı çıkarılabilir; sınav ağırlığı kalıp cümleyle istenmez | `DUO_TURN_RULE`, `podcastStructureIssues`, `podcast-episode.ts` |
| Dinleme kontrolü | En az bir soru kısa bir durumda uygulatır | `PODCAST_CHECK_BRIEF` |
| Konu testi | Aynı testte neredeyse aynı iki soru (I); "Bir öğrenci …" kurgusu, kaynağa gönderme, kökün cevabı vermesi kural metninde | `quizSetIssues`, `TOPIC_TEST_RULE` |

Yerel doğrulama (aynı iki kaynak, eski ve yeni kod, ~0,08 $): ikisi de ders üretti, hiçbir kavram atılmadı;
yeni kodda yeni işaretlerden hiçbiri kalmadı; Büyüme dersinin vakası gerçek bir vakaya döndü ("son kontrolde
ölçümler normal ama kendi eğrisinden uzaklaşmış"). Podcast'te "Evet;/Hayır;" açılışı 0, Kerem 15 sıranın 2'sinde
soru soruyor. Süre bu iki örnekte uzadı (79 → 153 sn, 115 → 222 sn; ilk ekran 17-28 sn); örnek tek, oynak —
canlıdaki ilk ekran p95 izlenmeli (`/admin/beta`, hedef < 20 sn).

## Düzeltilmeyen, açık kalan

- **Neden/nasıl anlatımı** yalnız istemle duruyor; kodla ölçülemiyor. Kaynak kuralı kesin kaldığı sürece
  kaynakta nedeni olmayan bilgi ancak "Genel bilgi" kutusuyla açıklanabiliyor (ders başına en çok iki).
- **İkinci sorunun doğru şıkkı ana soruyla aynı metin** (20 Ekim kuralı) ikinci soruyu dar tutuyor; anahtar hatasını
  önlemek için bilerek duruyor.
- Canlıdaki podcast'in "Evet;/Hayır;" kalıbı yerelde (canlı girdiler olmadan) eski kodla da çıkmadı; kaynağı
  canlı girdilerden biri olabilir. Kod denetimi ve kural iki yerde de koruyor.

## Sıradaki ölçüm

Yayından sonra aynı on çiftin Cortex tarafı yeniden üretilip aynı yargıçlarla üçüncü tur. "Daha iyi öğretiyor"
ancak öğrenci gözü ve podcast de bizden yana dönerse söylenir.
