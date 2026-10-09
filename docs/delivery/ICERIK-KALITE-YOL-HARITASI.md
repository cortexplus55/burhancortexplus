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

---

## 7. Bütün içerik öğretmen motorlarında (2 Ekim 2026, akşam)

Ürün sahibinin kararları (soru turları): sohbet moda göre davranır ve
"Yalnızca belgem" ile açılır; her derste gündelik örnek; eski bozuk konular
silindi; **bütün içerik** yeni motora; belgesiz dersler genel bilgiyle aynı
motordan; yeni yüklemelerde "ana konu + içinde kavram birimi dersleri"; eski
onarım katmanı 9 Ekim'de silinecek.

| İçerik | PR | Altın deneme |
|---|---|---|
| Öğretmen sohbeti, modlar, kelime araması, ders kaynak sayılır, tablolar | #220 #222 #223 | 12 soru, < $0.02 |
| Gündelik örnek zorunlu, bozuk konu süzgeci | #221 | KPSS, Termodinamik 0 sorun |
| Belgesiz ders | #224 | Üslü sayılar, Mitoz-mayoz 0 sorun |
| Konu testi + tuzak | #225 | KPSS 5/5, Termo 5/7, belgesiz 5/6 |
| Podcast (5 tür) | #226 | KPSS Basit, Termo Diyalog 0 sorun |
| Kartlar | #227 | KPSS 8/8 |
| Bütün çoktan seçmeli testler + şık karıştırma | #228 | deneme sınavı biçimi 4/4 |
| Doğru/yanlış + sözlü | #229 | 8/8 + 3/3 |
| Ders sorularında şık karıştırma | #230 | — |
| Kavram birimleri | #231 | KPSS s.5–28 → 8 birim, s.60–78 → 6 birim |

Canlıda bulunup düzeltilenler: sohbetin "kast/taksir" sorusunda öğrencinin
dersini kaynak saymaması (#222), sohbet tablolarının çizilmemesi (#223),
gösterim çeviricinin "P-v"yi "P⁻v" yapması (#226), test ve podcastin dersten
farklı sayfalardan yazılması (#226), doğru cevabın hep ilk şık olması (#228, #230).

---

## 8. Faz 5 — Astra ile yan yana (9 Ekim 2026)

Astra Plus hesabıyla ve kurucu hesabıyla, aynı konuda. Puan anahtarı Bölüm 4'teki
(0–2): sadakat, doğruluk, Türkçe, öğretim akışı, kontrol kalitesi, sınav odağı.
Astra'nın ders içeriği sayfanın kendi verisinden tam okundu; metin buraya
kopyalanmadı, yalnız yapı ve bulgu yazıldı.

### KPSS Vatandaşlık — ders

Bizim: "Toplumsal Düzen ve Hukuk Kuralları" (Ders 1/6, belge s.3–16; 4 bölüm).
Astra: "Hukukun Müeyyidesi ve Uygulama Alanları" (3 bölüm, ~3 dk, 8 adım). Ortak
kesit: yaptırım türleri ve hükümsüzlük.

| Ölçüt | Biz | Astra | Not |
|---|---|---|---|
| Sadakat | 2 | 2 | İkisi de belgeyle tutarlı |
| Doğruluk | 1 | 2 | Bizde "Devlet herkesten eşit oranda vergi alıyor → denkleştirici adalet" iki adalet türüne de okunabiliyor |
| Türkçe | 2 | 2 | |
| Öğretim akışı | 1 | 2 | Bizim ders 14 sayfa ve 4 büyük kavram; Astra'nınki dar (3 kavram) |
| Kontrol kalitesi | 2 | 1 | Astra'da sayma sorusu ("kaç ana başlık") ve "metne göre"; bizde her şıkkın gerekçesi var |
| Sınav odağı | 2 | 2 | Bizde sınav ipucu + yaygın hata + çözümlü örnek; Astra'da karşılaştırma kutuları |
| **Toplam** | **10** | **11** | |

Astra'da olup bizde olmayan: doğru/yanlış sorusunda yanlış ifadenin **doğrusu**
ayrı satırda veriliyor.

### KPSS Vatandaşlık — sohbet (3 soru, ikisi de belgeli mod)

Sorular: yokluk–mutlak butlan farkı; korkutularak imzalatılan sözleşme; genellik–
soyutluk ayrımı.

| Ölçüt | Biz | Astra | Not |
|---|---|---|---|
| Sadakat | 2 | 1 | Astra belgede olmayan ayrıntı ekliyor (hâkimin kendiliğinden dikkate alması, iptal süresi) — doğru ama işaretsiz |
| Doğruluk | 2 | 1 | Astra: "kimlere / ne zaman" diye açıyor — "ne zaman" süreklilik, soyutluk değil |
| Türkçe | 2 | 2 | |
| Öğretim akışı | 1 | 2 | Bizimkiler doğru ama kısa (bir cevap iki cümle); Astra sonuçları ve "neden"i açıyor |
| Kontrol kalitesi | 2 | 2 | İkisi de soruyla bitiyor |
| Sınav odağı | 2 | 2 | |
| **Toplam** | **11** | **10** | |

### Pediatri — sohbet (3 soru)

Belgeler aynı değil (bizde 10 sayfalık pediatri notu, Astra'da "Sağlam Çocuk
İzlemi"), puanlanmadı. Gözlem: bizim üç cevabın ikisi "belgende geçmiyor" dedi
(baş çevresi artışı, tarama takvimi) — "Yalnızca belgem" modunun doğru davranışı,
ama öğrenci sınav bilgisini alamadı. Astra aynı sorulara dolu ve doğru cevap verdi
("notlarındaki bilgilere göre" diyerek; belgesi farklı olduğu için doğrulanamadı).
Belgede olan soruda (gelişimsel alarm bulguları) bizim cevap doğru ve öz.

### Sonuç ve yapılan

Ders ve sohbette fark küçük ve iki yönlü: biz doğruluk, sadakat ve kontrol
gerekçelerinde öndeyiz; Astra ders kapsamının darlığında ve sohbet derinliğinde.
Düzeltilen (aynı gün): durum sorusunda olayın tek kavrama okunması kuralı yazara ve
denetçiye eklendi (`teacher-lesson.ts`).

Ürün sahibinin kararları (aynı gün):

| Konu | Karar | Nerede |
|---|---|---|
| Ders kapsamı | Yapay zekâ öğretmen gibi karar verir; sabit kavram/sayfa tavanı yok, yeniden sorulmaz | kavram birimi adımı |
| Belgede olmayan bilgi | Hazırlık sohbeti "Belgem + genel bilgi" moduyla açılır; genel bilgi "Genel bilgiden:" paragrafında, denetçi doğruluğuna bakar | `chat-panel.tsx`, `teacher-tutor.ts` |
| Sohbet derinliği | "Neden / fark ne / ne olur" sorularında sonuç, koşul ve örnek de açılır | `teacher-tutor.ts` (TEACHER_MANNER) |
| Doğru/yanlış | Yanlış ifadenin doğrusu (`corrected`) cevaptan sonra "Doğrusu" satırında; eksikliği dersi düşürmez (düşük önem) | `teaching-standards.ts`, `teacher-lesson.ts`, `exam-lesson-steps.tsx` |
Maliyet: bizde 6 sohbet mesajı (~$0,02); Astra'da Plus hakkından.
