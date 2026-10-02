# İçerik kalitesi yol haritası — Astra'nın öğretmen mantığı, bizim belgemiz

**2 Ekim 2026.** Ürün sahibinin isteği: içerik kalitesi en üst seviyede; ders ve
AI öğretmen **yalnız belgedeki bilgiyi** aktarır, **kendi cümleleriyle**, **öğretmen
edasıyla**. Asıl model `gpt-6-luna` (#218).

Bu belge tahmin değil, aynı belgeyle yapılan yan yana okumadan çıktı.

---

## 1. Ne karşılaştırıldı

| Belge | Astra | Biz |
|---|---|---|
| KPSS-Vatandaslik-Konu-Anlatimi.pdf (211 s.) | "Hukukun Müeyyidesi ve Uygulama Alanları" dersi (8 adım), baştan sona çözülerek okundu; hazırlık sohbetinde iki soru | "KPSS HUKUKUN TEMEL KAVRAMLARI" dersi (kayıtlı, 30 Eylül) |
| Pediatri_10_Sayfa_Konu_Anlatimi.pdf | (önceki tur) | "Büyüme ve Gelişme" dersi (kayıtlı) |

Astra'nın her iddiası belgenin sayfa metninde arandı (bizde kayıtlı sayfa
metinleri; belge yeniden işlenmedi).

---

## 2. Astra'nın öğretmen mantığı (gözlenen)

**Ders kapsamı dar ve bütün.** Tek ders = tek kavram ailesi, belgenin ardışık
5 sayfası (s.5–9: yaptırım türleri → hükümsüzlük dereceleri → örf-âdet).
3 bölüm, "3 dk okuma · 8 adım".

**Akış:**

1. **Giriş kartı** — kanca cümlesi ("Bir kuralın hukuk kuralı sayılması için
   yazılı olması değil, arkasında devlet gücü bulunması gerekir"), "Seni neler
   bekliyor" bölüm listesi, "Sonunda kısa bir test".
2. **Önce dene** — konu anlatılmadan önce doğru/yanlış. Yanlış cevapta
   yanlış önerme **düzeltilmiş hâliyle** yeniden yazılıyor + kısa açıklama.
3. **Kavram adımı** — önceki derse bağlanan giriş ("Daha önce değindiğimiz
   gibi…"), zıtlıkla anlatım (manevi ↔ maddi yaptırım), **tanım listesi**
   (Ceza / Cebri İcra / Tazminat / Hükümsüzlük, her biri tek cümle),
   **gündelik örnek kutusu** ("📝 Tazminat vs. Ceza: kırmızı ışıkta geçip
   arabaya çarptığında devlete ödediğin ceza, karşı tarafın hasarı tazminat").
4. **Hızlı sınav** — çeldiriciler aynı listedeki **kardeş terimler**.
   Açıklama doğruyu söyler **ve her çeldiricinin gerçekte ne olduğunu** söyler
   ("Metinde tazminat… olarak tanımlanmıştır. Ceza suç karşılığıdır, cebri icra
   borcun devlet zoruyla tahsilidir…"). Yanlışta: "Dersin sonunda buna geri
   döneceğiz."
5. **Karıştırılan iki kavram uyarısı** — "❗ Yokluk ve Butlan farkı" kutusu.
   Örnekler belgenin kendi örnekleri (nikâh memuru önünde yapılmayan evlilik).
6. **Tekrarla** — yanlış yapılan kavram **farklı yönden** soruluyor: tanım →
   terim yerine **senaryo → terim** ("Borcunu ödemeyen kişinin malına icra
   dairesiyle el konulması hangi yaptırımdır?").
7. **Kapanış** — "Kendini test et".

**Öğretmen sohbeti:**

- Duyguya karşılık ("Bu çok haklı bir kafa karışıklığı…"), sonra **ayırt
  ettiren tek ölçüt** baştan.
- İki kavram **aynı başlıklarla** karşılaştırılıyor (neden olur / zamanaşımı /
  kim ileri sürebilir / sonuç) — bu başlıklar belgenin s.9'daki
  karşılaştırma tablosundan.
- **Sınav taktiği**: soruda aranacak anahtar kelimeler.
- **Bir kontrol sorusuyla bitiyor.**
- Kapsam dışı soru ("Fransa'da sendika kaç kişiyle kurulur?"): kibarca
  "sınavında çıkmaz" diyor ve **belgedeki karşılığına** bağlıyor (s.52: en az
  yedi kişi), sonra bir sonraki adımı öneriyor.

**Astra'nın hataları (alınmayacak):** s.4'te "Yokluk, Butlan ve Tek Taraflı
Bağlamazlık" deyip s.5'te "Yokluk, Mutlak Butlan, Nisbi Butlan" sayması;
sayma sorusu ("kaç ana başlık?") öğretici değil.

---

## 3. Bizde ne bozuk — kök nedenler

### 3.1 Konu bölme sayfa başlığını konu sanıyor
"KPSS HUKUKUN TEMEL KAVRAMLARI" belgenin **her sayfasının üstündeki tekrar eden
başlık**. Konu adı oldu; ders s.5, 6, 11, 13, 28'den beş ilgisiz alt konuyu
2–3'er cümleyle topladı. Öğretmek değil, özet listesi.

### 3.2 Kaynak metni gürültülü ve biz onu kopyalatıyoruz
PDF'in metin katmanı bozuk ("uyarlars", "antra", "ayrıt etme gücü", "irade
sürdürülebilir", "İPTAL EDİLEBİRLİK"). Doğrulayıcılarımız cümlelerin kaynakla
**kelime örtüşmesini** istiyor; model bozuk kelimeleri olduğu gibi taşıyor.
Sonuç: "Boşluklarda hakime DÜZEN, başka hükmü uygulamaktır."

### 3.3 Kod içerik uyduruyor
Taslaktan sonra ~16.000 satırlık onarım katmanı (`lesson-*.ts`,
`teaching-standards.ts`, düğüm rotası) metni değiştiriyor:

- paragraf sonuna "Kaynak: …pdf, s.N." ekliyor (`lesson-teach.ts:778, 1171, 1491`),
- son bölüme kaynaktan cümle yapıştırıyor (`lesson-teach.ts:1171`),
- özet kurulamazsa **kalıp cümle** üretiyor: "…konusunda kural, tanımına ve
  şartına bağlıdır", "Uygulama, verilen durumu kuralın şartıyla ayırt etmektir"
  (`lesson-teach.ts:895`),
- iç not öğrenciye sızıyor ("Doğrulanamayan cümleler çıkarıldı.").

Öğrencinin "sıradan yapay zekâ" diye hissettiği ses büyük ölçüde bu katman.

### 3.4 Pedagoji iskeleti zayıf
Kanca yok, önce-dene yok, tanım listesi / karşılaştırma tablosu yok, gündelik
örnek yok, kontroller bariz ("Hukukun amacı kaos yaratmak değil… doğru mu?"),
örnek dersle ilgisiz (madeni para ile ödeme), "sıradaki adım: KPSS".

### 3.5 Sohbet kalıp dolduruyor
Sistem istemi yamalardan oluşuyor (genel asistan cümlesi + veritabanı istemi +
tur rehberi + tarz + bağlam + ek). Hazırlık sohbeti JSON şablonla yazdırılıp
metne çevriliyor; sonuç "1. Nerede takıldığın / 2. Tek ipucu / 3. Kontrol
sorusu" kalıbı.

---

## 4. Yol haritası

Her faz canlıda aynı belgelerle Astra'ya karşı okunarak kapanır. Faz bitmeden
sonrakine geçilmez.

### Faz 1 — Temiz kaynak (temel)
- Sayfa başına **temiz metin** geçişi (luna): yazım/tanıma hatalarını düzelt,
  tabloyu koru, **bilgi ekleme, çıkarma, yorumlama yok**. `document_pages.clean_text`.
- **Tekrar eden üst/alt bilgi** (her sayfadaki başlık, sayfa no) tespit edilip
  atılır — konu adı olamaz.
- Belgenin kendi başlık hiyerarşisinden **kavram birimleri**: her birim 2–6
  ardışık sayfa.
- Maliyet: 211 sayfalık belge ≈ 211 × ~3k jeton ≈ **$0,15–0,30** (luna).

### Faz 2 — Ders = tek kavram birimi
- Bir ders tek kavram biriminden yazılır (3–4 bölüm, ~3 dk okuma).
- Konu adı içerikten; sayfa başlığı, bölüm numarası, BÜYÜK HARF değil.

### Faz 3 — Yeni ders motoru: tek öğretmen istemi + bağımsız doğrulama
- **Tek, güçlü öğretmen istemi** (Bölüm 2'deki akış): giriş kartı, önce dene,
  kavram adımları (zıtlık, tanım listesi, karşılaştırma tablosu, gündelik
  örnek kutusu, karışan kavram uyarısı), kardeş çeldiricili kontrol + her
  şıkkın açıklaması, belgedeki çözümlü örnek, sınav anahtar kelimeleriyle özet.
- **Kaynak kuralı:** her olgu, tanım, sayı, eşik belgeden. Benzetme / gündelik
  örnek yalnız belgedeki bir kavramı **açıklamak** için, yeni bilgi taşımaz
  (karar bekliyor — Bölüm 5).
- **Doğrulama modelle, onarım modelle:** ikinci luna çağrısı her iddiayı temiz
  kaynakla eşler; sorun listesi aynı modele düzeltme olarak döner. **Kod metin
  eklemez** — "Kaynak:" yapıştırma, kalıp özet, cümle ekleme kaldırılır.
- Kaynak sayfası arayüzde zaten "N kaynak" düğmesinde (#206); metne yazılmaz.
- Eski kayıtlı dersler olduğu gibi oynar.

### Faz 4 — Öğretmen sohbeti
- Tek tutarlı kişilik istemi ("Cortex öğretmeni"); yamalar birleşir.
- Her soruda belgeden **ilgili pasajlar** (temiz metin) getirilir; cevap yalnız
  onlardan.
- Biçim sabit şablon değil, duruma göre: kavram karışıklığında karşılaştırma,
  problemde Sokratik adım, ezber sorusunda kısa tanım + sınav ipucu. Her cevap
  bir kontrol sorusuyla biter.
- Kapsam dışı: "sınavında yok" + belgedeki en yakın karşılık.
- JSON şablonla yazdırma kaldırılır.

### Faz 5 — Ölçüm (sürekli)
- **Altın set:** KPSS (s.5–9), Pediatri (büyüme-gelişme), Termodinamik
  (birinci yasa) — her biri için 1 ders + 3 sohbet sorusu.
- **Puan anahtarı (0–2 her biri):** belgeye sadakat, doğruluk, Türkçe akıcılık,
  öğretim akışı, kontrol kalitesi, sınav odağı. Astra'nın aynı belge çıktısıyla
  yan yana. Hedef: her ölçütte Astra'ya eşit ya da üstün; sadakatte kusursuz.
- Ders başına model maliyeti kayda geçer (luna fiyat satırı eklendi).

---

## 5. Ürün sahibinin kararları (2 Ekim 2026)

1. **Yeni ders motoru:** tek öğretmen istemi + model doğrulaması; kod metne bir şey eklemez. Eski dersler aynen oynar.
2. **Temiz metin:** her belgeye luna ile sayfa temizliği (yeni yüklemede otomatik; eskiler ilk ders üretiminde).
3. **Gündelik örnek:** serbest ama bilgi eklemeden — yeni olgu, sayı, tanım, kural yasak; doğrulayıcı denetler.
4. **Altın set bütçesi:** onaylandı, en fazla $2; maliyet raporlanacak.

---

## 6. Altın deneme sonuçları (2 Ekim 2026, gpt-6-luna)

Yerel ölçüm betiği `cortex-plus/tests/unit/_tmp/golden-lesson.test.ts` (CI'da
çalışmaz, veritabanına yazmaz). Ders motoru üç belgede **sıfır sorunla** geçti:

| Belge | Sayfa | Taslak | Süre | Maliyet |
|---|---|---|---|---|
| KPSS Hukuk | 5–9 | 2 | 139 sn (temizlik dahil) | $0.013 |
| Pediatri | 4 (Solunum) | 3 | 120 sn | $0.010 |
| Termodinamik | 14–15 (Sınır işi) | 3 | 118 sn | $0.009 |

Yolda çıkan ve kurala bağlanan dersler:

- **Kaynakta büyük harf başlık** ("MADDİ YAPTIRIMLAR") iki düzeltme turunda da
  değişmedi → `calmHeading` yazımı normale çeviriyor; istem de söylüyor.
- **Belgenin kendisi bozuk olabilir.** KPSS s.8: "işlemin kanunun öngördüğü
  şekilde *yapılması* durumunda hüküm doğurmaması" (olumsuzluk eki düşmüş).
  Yazar kopyalıyor, denetçi itiraz ediyordu; düzeltme turu kaynak kuralına
  takılıp dokunmuyordu. Şimdi: yazar kaynağın kendi örnekleriyle tutarlı
  anlamı **sessizce** yazar; denetçi bunu sorun saymaz, "kaynakta yanlış
  yazılmış" gibi derse düşen iç notu ise yakalar (yapı denetimi + G maddesi).
- **Temizlik reddi haksızdı:** üst/alt bilgideki "Sayfa 14/30" ve "14" atılınca
  sayılar kayıp sayılıyordu → kenar satır sayıları affediliyor (yalnız ≥8
  satırlık sayfada).
- Düzeltme turu dersi aynen geri verirse döngü durur (boşa denetim yok).
