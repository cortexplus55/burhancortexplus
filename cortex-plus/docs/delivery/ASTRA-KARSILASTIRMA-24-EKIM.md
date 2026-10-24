# Astra ile tam karşılaştırma — 24 Ekim 2026

Ürün sahibi için. Cortex Plus ile Astra AI'yı fiyat, ücretsiz katman, özellik, içerik kalitesi, hız,
belge işleme, ödeme, gizlilik ve olgunluk başlıklarında yan yana koyar.

Bugün canlıda **kredi v2** var. **Kredi v3** (PR #397) henüz birleşmedi. Birleşince değişen her sayı
ayrı sütunda.

Sayılar her yerde aynı sırayla yazılır: **önce Cortex, sonra Astra** ("Cortex X · Astra Y"). Tablolarda
sütun başlığı hangisinin hangisi olduğunu söyler. Sonda kısa bir sözlük var.

Her satırın dayanağı yazılı:

| Etiket | Anlamı |
|---|---|
| ölçüldü + tarih | İki ürün aynı belgeyle denendi; süre ya da puan ölçüldü |
| ölçüldü (yerel) | Bizim taraf canlı kodla ama yerelde üretildi; ağ, yükleme ve ekran çizimi dahil değil |
| koddan | Bizim kodumuzdan okundu (v2: canlı `main`, v3: `feat/kredi-v3`) |
| canlı 24 Ekim | Bugün iki ürünün sayfasında görüldü (yalnız okundu, bir şey üretilmedi) |
| gözlem + tarih | Ekranda görüldü ama puanlanmadı |
| eski + tarih | Eylül ya da 3 Ekim gözlemi; sonra yeniden denenmedi |
| hesap | Yukarıdaki sayılardan bölme ya da çarpmayla çıktı |
| değerlendirme | Ölçüm değil; ölçülmüş farklara bakılarak verilmiş puan |

**İçerik kalitesindeki bütün yargıçlar ve "öğrenci"ler yapay zekâ ajanıdır** (Claude ajanları; 3. turda
yargıçlar başka bir modelde koştu). Kendi ürünümüzü kendi ajanımız yargılıyor. Gerçek öğrenci ölçümü yok:
kapalı beta henüz açılmadı.

Bilgiler çelişince en yeni ölçüm alındı. Çelişkilerin ve doğrulanmamış noktaların listesi 11. bölümde.

---

## 1. Tek bakışta

| Konu | Önde | Ne kadar | Dayanak |
|---|---|---|---|
| Plus fiyatı | Astra, az farkla | Aylık Cortex ₺599 · Astra ₺583. Yıllıkta bugün eşit (≈₺250/ay); v3'te bizde yıllık yok | canlı 24 Ekim |
| Plus'ta ders hakkı | Bugün biz; v3'te Astra eşit ya da önde | Ayda Cortex v2 1.200 · Astra ≈220–380. v3'te yalnız ders 240 (Astra'nın aralığının alt ucu); ders ile konu testini birlikte sayarsak 180 (aralığın altında) | ölçüldü 8 Ekim; koddan; hesap |
| Plus'ta sohbet hakkı | Biz | Ayda Cortex 2.400 · Astra ≈2.000 mesaj (+%20) | ölçüldü 8 Ekim; koddan |
| Ücretsiz katman | Karışık | Mesajda biz: Cortex v3 günde 3 · Astra ≈1,5–2. Özellik türünde Astra: ücretsizde podcast ve Lab açıktı (12 Eylül); bizde podcast, sözlü, yazılı deneme ve video Plus'ta. Astra'nın ücretsiz ders ve fotoğraf hakkı ölçülmedi | ölçüldü 3 Ekim; eski 12 Eylül; koddan |
| Ders kalitesi | Biz | Son kör turda öğrenme, sınav ve sadakat gözü 18/18; öğrenci gözü 13/18. Belgeden yazılmış sınavda Cortex 61/75 · Astra 31/75 (kısmen kapsam ölçüsü: Astra'nın bir dersi komşu bölümü anlatıyordu). Yargıçlar yapay zekâ ajanı | ölçüldü 23 Ekim |
| Podcast | Astra | Öğrenci gözü Cortex 65 · Astra 72. Sınav ve sadakat gözünde biz öndeyiz | ölçüldü 23 Ekim |
| Hız | Hazır derste biz; testte ve soğuk podcast'te Astra; soğuk derste belirsiz | Hazır ders Cortex 1,7–3,2 sn · Astra 43,5 sn. Hazır test Cortex 1,3 sn · Astra 0,3 sn. Soğuk ilk ekran Cortex 13–49 sn · Astra dersin tamamı ~43 sn. Soğuk podcast Cortex büyük olasılıkla 200 sn üstü · Astra 43–47 sn | ölçüldü 18–23 Ekim |
| Soru çözücü | Doğrulukta eşit; hızda büyük olasılıkla biz | İkisi de 10/10. İlk çözüm Cortex 2,9–9,5 sn (yerel koşu) · Astra 3–27 sn (canlı). Aynı koşulda ve aynı sorularla yan yana ölçülmedi | ölçüldü 23 Ekim |
| Özellik genişliği | Astra | Oyun ve simülasyon (Lab), mağazada iOS + Android uygulaması, 22 hazır içerikli resmî sınav, veli hesabı | canlı 24 Ekim |
| Ödeme ve güven | Farklı yollar | Bizde otomatik yenileme yok (teknik engel, tercih değil), kart bize gelmez. Astra "notun yükselmezse tam iade" sözü veriyor | canlı 24 Ekim |

**Kısaca:** Öğretmede (yapay zekâ yargıçlara göre) ve hazır ders hızında öndeyiz. Podcast'te, ürün
genişliğinde ve ücretsizde açık özellik türünde gerideyiz. v3'ten sonra fiyat üstünlüğümüz yalnız mesajda
kanıtlı (+%20). Fotoğraf çözümünde Astra'nın harcaması ölçülmedi, kıyas yok. Derste (ders + test) gerideyiz.

---

## 2. Fiyat ve paketler

| Paket | Astra | Cortex bugün (v2) | Cortex v3 sonrası | Dayanak |
|---|---|---|---|---|
| Plus aylık | ₺583/ay | ₺599/ay | ₺599/ay | canlı 24 Ekim; koddan |
| Plus aylık, günlük karşılığı | ₺19,43 | ₺19,97 (sayfada yazıyor) | ₺19,97 | hesap |
| Plus yıllık | ₺2.995/yıl (₺250/ay), "%58 tasarruf" | ₺2.990/yıl (₺249/ay), günde ₺8,20 | **Satışta yok**; elinde olan dönem sonuna kadar Plus | canlı 24 Ekim; koddan |
| Plus haftalık | Yok | ₺349 / 7 gün, tek ödeme | Aynı | canlı 24 Ekim |
| Sigma aylık | ₺2.000/ay | ₺1.999/ay | Aynı | canlı 24 Ekim |
| Sigma yıllık | Yok (yıllık sekmesinde de aylık faturalı) | ₺9.990/yıl | Satışta yok | canlı 24 Ekim; koddan |
| Ek paket | Var, yalnız abone; fiyatı görülmedi | ₺129 / ₺329 / ₺749 → 1.000 / 2.500 / 5.750 kredi; yalnız abone | Fiyat aynı; ders cinsinden 5 kat az (küçük paket 166 → 33 ders) | canlı 24 Ekim; koddan |
| İndirim | "BACK TO SCHOOL" geri sayımı | Bant ve sayaç yok; kod kutusu; kapalı beta için 14 gün Plus kodu (ortak kodda ilk 50 kişi) | Aynı | canlı 24 Ekim; koddan |

Notlar:

- **Astra'nın fiyatı oynuyor.** 5 Eylül: Plus ₺770, yıllık ₺3.852, Sigma ₺2.567 (eski). 8 Ekim: Plus ₺599,
  Sigma ₺1.997. Bugün: ₺583 ve ₺2.000. Bugün yıllık sekmesinde üstü çizili "eski fiyat" ₺599 görünüyor.
- Astra mevcut abonesine yıllığı "aylık ₺249,59 · −%67" diye sunuyor (canlı 24 Ekim).
- **v3 yıllığı neden kaldırıyor:** yıllık Plus, KDV ve PayTR düşüldükten sonra abone başına ayda ~₺200
  bırakıyordu; normal öğrencinin gideri düşülünce ayda ~₺234 zarar (hesap 24 Ekim, varsayımlı senaryo: kur,
  kullanım profilleri, abone başına 5 ücretsiz öğrenci; `MALIYET-VERGI-24-EKIM.md`).
- Haftalık plan bilerek pahalı: aya vurunca ~₺1.496, aylığın 2,5 katı (koddan).
- **Sigma farkı:** Astra "en akıllı model, öncelikli yanıt" diyor. Bizde öğreten işler (ders, test, sohbet,
  podcast) her planda aynı modelde. Sigma'nın Plus'tan farkı hak (Plus'ın 8,3 katı) ve taranmış sayfa sınırı
  (ayda 1.000). Küçük not: 10 sayfadan uzun belgeyi işlerken abone (Plus ve Sigma) gpt-4.1 alıyor
  (`model-router.ts`); hızlı işlem de yalnız ücretli planlarda (koddan).

---

## 3. Paranın karşılığı

### Plus ile ayda ne alırsın

Her satır "hakkın tamamı yalnız bu işe giderse" demek. İşler aynı aylık haktan düşer; biri artınca
öteki azalır.

| İş | Astra Plus | Cortex v2 (bugün) | Cortex v3 | Dayanak |
|---|---|---|---|---|
| Ders | ≈220–380 | 1.200 | **240** | ölçüldü 8 Ekim; koddan |
| Ders + konu testi (birlikte) | ≈220–380 (dersle yazılan test bu yüzdeye dahilse; ölçülmedi) | 720 | **180** | ölçüldü 8 Ekim; koddan; hesap |
| Sohbet mesajı | ≈2.000 | 2.400 | 2.400 | ölçüldü 8 Ekim; koddan |
| Konu testi | Ölçülmedi | 1.800 | 720 | koddan |
| Kart seti | Ölçülmedi | 2.400 | 1.800 | koddan |
| 5 dk sesli podcast | Ölçülmedi | 100 | 100 | koddan |
| Sözlü deneme | Ölçülmedi | 900 | 1.200 | koddan |
| Yazılı deneme | Ölçülmedi | 480 | 480 | koddan |
| Fotoğraftan soru çözümü | Ölçülmedi | 720 | 1.800 | koddan |
| Video ders | Ölçülmedi ("aylık limitinden fazlasını kullanır") | 25 | 25 | koddan; gözlem 17 Ekim |
| Metinli belge sayfası | Ölçülmedi ("daha yüksek yükleme limitleri") | 3.600 | 1.440 | koddan |
| Taranmış/fotoğraf sayfası (ayrı sınır) | Ölçülmedi | 300 | 300 | koddan |

Astra'nın sayıları 8 Ekim'de tek hesapta ölçüldü: 1 mesaj aylık hakkın %0,05'i, 1 ders %0,26–0,45'i.
Astra'da ders sonu testi dersle birlikte yazılıyor ve yolda dersle tek adım; ölçülen ders yüzdesine testin
girip girmediği ayrıca ölçülmedi. Bizde konu testi ayrıca düşer (v3'te 10 kredi). Astra'da öğrenci yalnız
yüzde görüyor (bugün Plus test hesabında "%34 kullanıldı"); bizde de öğrenci kredi sayısı değil yüzde ve iş
sayısı görüyor.

- **Haftalık Plus** (2.700 kredi): v2'de 450 ders ya da 900 mesaj; v3'te 90 ders, 270 test, 900 mesaj,
  37 podcast ya da 9 video (koddan).
- **Sigma** (60.000 kredi): v2'de 10.000 ders ya da 20.000 mesaj; v3'te 2.000 ders, 6.000 test,
  20.000 mesaj, 833 podcast ya da 214 video (koddan). Astra Sigma "Plus'ın 8 katı" diyor → ≈16.000 mesaj (hesap).

### Kullanım başına fiyat (Plus aylık)

| Bir iş | Astra | Cortex v2 | Cortex v3 |
|---|---|---|---|
| Ders | ₺1,53–2,65 | ₺0,50 | ₺2,50 |
| Ders + konu testi | ₺1,53–2,65 (test dahilse) | ₺0,83 | ₺3,33 |
| Sohbet mesajı | ₺0,29 | ₺0,25 | ₺0,25 |
| Konu testi | Ölçülmedi | ₺0,33 | ₺0,83 |
| Kart seti | Ölçülmedi | ₺0,25 | ₺0,33 |
| Fotoğraftan çözüm | Ölçülmedi | ₺0,83 | ₺0,33 |
| Sözlü deneme | Ölçülmedi | ₺0,67 | ₺0,50 |
| Yazılı deneme | Ölçülmedi | ₺1,25 | ₺1,25 |
| 5 dk sesli podcast | Ölçülmedi | ₺6,0 | ₺6,0 |
| Video ders | Ölçülmedi | ₺23,3 | ₺23,3 |

Hepsi hesap. Astra: bugünkü ₺583 bölü 8 Ekim'de ölçülen sayı (₺599 ile ders ₺1,58–2,72, mesaj ₺0,30).
Bizde 1 kredi ≈ ₺0,083 (₺599 / 7.200); ek pakette ≈ ₺0,13.

**Ne demek:** v2'de ders Astra'nın 3–5 katı ucuzdu. v3'te yalnız ders Astra'nın pahalı ucunda (Cortex ₺2,50 ·
Astra ₺1,53–2,65); ders ile testi birlikte sayarsak Cortex ₺3,33, Astra'nın aralığının üstünde. Mesajda biraz
ucuzuz. v3'te fotoğraf çözümü bizde ucuzluyor (10 → 4 kredi); Astra'nın fotoğraf başına harcaması ölçülmedi,
bu yüzden fotoğrafta kıyas yok.

Ders, konu testi, belge sayfası, fotoğraf çözümü ve podcast fiyatları ölçülen model maliyetinden geliyor
(1 kredi ≈ $0,001): ders $0,028, konu testi $0,010, belge sayfası $0,0043, fotoğraf çözümü $0,0034, 5 dk sesli
podcast $0,070 (ölçüldü 23–24 Ekim). Kart seti (3 → 4) ve sözlü deneme (8 → 6) ölçümsüz ayarlandı. v2'de
ders, test ve mesaj bu maliyetin altında satılıyordu.

---

## 4. Ücretsiz katman

| Konu | Astra | Cortex v2 (bugün) | Cortex v3 | Dayanak |
|---|---|---|---|---|
| Hak modeli | Tek sayaç, yüzde; her gün 03:00'te sıfırlanır | Günde 6 kredilik tek havuz | Kredi yok, ayrı sayaçlar: ders Pazartesi 00:00, mesaj ve fotoğraf gece yarısı (İstanbul) | eski 12 Eylül; koddan |
| Sohbet | Günde ≈1,5–2 mesaj (ilk mesaj hakkın %64'ü; 3. mesajda bulanık cevap + kapı) | Günde 2 mesaj (dersle aynı havuz) | Günde 3 mesaj | ölçüldü 3 Ekim; koddan |
| Ders | Ölçülmedi | Günde 1 (mesajla aynı havuz) | Haftada 3 | koddan |
| Test, kart | Aynı sayaçtan | Aynı havuzdan (1 test ≈ 1 ders yeri) | Yolda dersi açılmış konunun testi ve kartları derse dahil; Araçlar'dan ve düellodan açılan haftalık ders hakkından | koddan |
| Yeni hazırlık | Sayaç %0'ken bile kuramıyor (tek hesapta görüldü; o hesapta önceden hazırlık olup olmadığı bilinmiyor) | 1 hazırlık | 1 hazırlık | ölçüldü 3 Ekim; koddan |
| Belge | Hak dolunca PDF yükleme kilitli | Hesap başına toplam 5 sayfa; taranmış sayfa ayda 2; 150 MB | Aynı | eski Eylül; koddan |
| Fotoğraftan çözüm | Denenmedi; ödeme sayfası Plus avantajı sayıyor | Günde 3, krediye dokunmaz | Günde 1 | canlı 24 Ekim; koddan |
| Podcast, sözlü, yazılı deneme, video | Kapı kullanımdaydı, ücretsiz hesap podcast'i açtı; ödeme sayfası bunları Plus avantajı sayıyor | Kapalı ("Plus'ta açık"); sesli tur açık | Kapalı; sesli tur ve seslendirme de Plus'ta | eski 12 Eylül + canlı 24 Ekim; koddan |
| Oyun, simülasyon | Açık | Yok | Yok | eski 12 Eylül |
| Model ve hız | Plus'ı "1,4 kat daha akıllı model" ve "2 kat hızlı yanıt" diye satıyor (pazarlama sözü); ücretsizdeki model gözlenmedi | Aynı model, normal işlem (hızlı işlem yalnız Plus) | Aynı; önceden yazım yalnız ders hakkı kaldıysa | eski 12 Eylül; koddan |
| Davet | İkinize 3 kat günlük hak; abone olursa davet edene 400 kat; en çok 3 davet | Davetle gelene ve kaydolan her davet için davet edene 3 kat; davetli abone olursa davet edene 10 kat (18 Eylül'de 400'den indirildi); en çok 3 davet. Astra'nın 400 katından ayrılıyor | Çarpan yok; iki tarafa bir kez 3 ders (90 kredi), en çok 3 davet; hediye doğrulanmış hesap ister | canlı 24 Ekim; koddan (göç `20260918130000`) |
| Hak bitince | Geri sayım + "1300 katına çıkar" + "neden ücretsiz değil" + para iadesi sözü | Geri sayım + "neden ücretsiz değil"; Plus'a özel işte geri sayım yok | Sayacın kendi yenilenme saati | ölçüldü 3 Ekim; koddan |
| Kart istenir mi | Hayır | Hayır | Hayır | canlı 24 Ekim |
| Doğrulanmamış hesap | Görülmedi | Günde 6 kredi | Doğrulanmış hesapla aynı sayaçlar (günlük kredi ikisinde de 0); yalnız davet hediyesi doğrulama ister | koddan |
| Misafir | Uygulama girişli; "Ücretsiz dene" hesapsız 6 adım (rol seçimi dahil) | Uygulama girişli; kayıt hesapsız 6 adım, rol seçimi yok | Aynı | eski 11 Eylül |

### Bir haftada ücretsiz öğrenci ne yapabilir

| | Astra | Cortex v2 | Cortex v3 |
|---|---|---|---|
| Sohbet | ≈10–14 mesaj | 14 mesaj **ya da** 7 ders (aynı havuz) | 21 mesaj **ve** 3 ders |
| Ders | Ölçülmedi | En çok 7 | 3, testleri ve kartlarıyla |
| Fotoğraftan çözüm | Denenmedi | 21 | 7 |
| Yeni hazırlık | Kuramıyor (3 Ekim) | Toplam 1 | Toplam 1 |
| Podcast, sınav provası | Podcast açıktı (12 Eylül) | Yok | Yok |

Astra sütunu hesap (günde 1,5–2 mesaj × 7). Ayda: v2 30 ders ya da 60 mesaj + 90 fotoğraf;
v3 12 ders + 90 mesaj + 30 fotoğraf (koddan).

**Ne demek:** v3 ücretsizi mesajda daha cömert, derste ve fotoğrafta daha dar. Astra'nın ücretsizi
3 Ekim ölçümünde mesajda ikimizinkinden de dardı. Ama Astra ücretsizde daha çok özellik türü açıyordu
(Eylül gözlemi, yeniden denenmedi). Bu yüzden ücretsiz katmanda kazanan yok: mesajda biz, özellik türünde Astra.

"1300 kat" sözü günlük kullanım kıyası olarak tutmuyor: Astra Plus ayda ≈2.000 mesaj (günde ≈67), ücretsiz
günde ≈1,5–2 → günlük kıyasla ≈33–45 kat (hesap). 1300, Plus'ın **aylık** hakkının ücretsizin **günlük**
hakkına oranına denk (2.000 / ≈1,56 ≈ 1.280). Yanıltıcı olan sayı değil, "günlük kullanım" ifadesi.

---

## 5. Özellikler tek tek

"Cortex'te kime" sütunu: Herkes = ücretsiz dahil; Plus = Plus ve Sigma; — = bizde yok.

| Özellik | Astra | Cortex | Cortex'te kime | Dayanak |
|---|---|---|---|---|
| Belgeden hazırlık yolu | Yol ilerledikçe kuruluyor (giriş dersi + 2 kilitli adım) | Sınava kadar tam takvim (sınav setinde 24 gün, 94 etkinlik); şu anki + 2 adımdan sonrası soluk | Herkes (ücretsizde 1 hazırlık) | gözlem 18–20 Ekim |
| Yolun sonuca göre değişmesi | Kanıtlanmadı | %50 altı → odaklı pratik eklenir; %90+ → ek testler çıkar | Herkes | koddan; canlıda doğrulandı 18–20 Ekim |
| Yol sırası | Sırayla açılır, "Başka birini seç" | Aynı | Herkes | gözlem 18 Ekim |
| Kurulum sihirbazı | Ders → tarih → hedef → materyal → konular → "Nasıl çalışmayı seversin?" → odak → özet | Aynı sıra; aşinalık kurulumda bir kez; yarım taslak cihazlar arası | Herkes | gözlem 17–20 Ekim |
| Hazır resmî sınav programı | 22 sınav (YKS, LGS, KPSS, DGS, YDT), her biri 8–14 konu, 100–240 soru; Sigma'da hepsi | Hazır içerik yok. Resmî sınavlar sayfası (`/deneme-sinavlari/resmi`) sınav kataloğunu gösterir (TYT, AYT, LGS, KPSS, ALES, DGS, YDS/YÖKDİL, TUS, DUS) ve belgesiz kurulumu konu konu açar | Herkes (katalog); hazır içerik — | canlı 24 Ekim; koddan |
| Müfredat | Var; yıl yıl hazır içerik | Müfredat sayfası var (`/deneme-sinavlari/mufredat`: sınıf düzeyine göre ders kataloğu, kurulumu açar); hazır içerik yok | Herkes (sayfa); hazır içerik — | canlı 24 Ekim; koddan |
| Ders | Akıllı Metin; derste 5–7 soru + 5 soruluk test | 20 Ekim'den beri ekran başına bir soru (en çok 9 ekran; 18–19 Ekim ölçümünde 3, 20 Ekim sınav setinde 4 soruydu; yeniden sayılmadı) + konu testi; tablo, sınav ipucu kutuları, turuncu vurgu, ezber kodu, "Neden böyle?" | Herkes | ölçüldü 18–20 Ekim; koddan |
| Belgede olmayan bilgi | Etiketsiz, "metinde belirtilmiştir" diye | Ders, test ve sohbette yalnız etiketli ("Genel bilgi" ve "Neden böyle?" kutuları, sohbette "Genel bilgiden:"). Podcast'te 23 Ekim'den beri ders kitabının nedeni ve örneği etiketsiz; sayı, eşik, tanı ve sınıflandırma yine yalnız kaynaktan | Herkes | ölçüldü 16–20 Ekim; koddan |
| Konu testi | Var | Var; her şıkkın gerekçesi; aynı tablodan en çok 2 soru | Herkes | koddan |
| Çok cevaplı soru | Testin sonunda 1, kısmi puan | Aynı; dinleme kontrolünde de | Herkes | gözlem 17–19 Ekim |
| Doğru/yanlış, kartlar | Var | Var | Herkes | canlı 24 Ekim; koddan |
| Bilgi boşlukları, alıştırma | Var | Var (bilgi boşlukları, odaklı pratik) | Herkes | canlı 24 Ekim; koddan |
| Podcast | Var; sonunda kısa test | Var; 5 tür, iki ses, 5 soruluk dinleme kontrolü | Plus | canlı 24 Ekim; koddan |
| Video ders | Gerçek MP4, dikey 66 sn, 5 stil | Oynatıcıda birleşen resim + ses + alt yazı; aynı 5 stil; her sahnede kaynaktan "kilit bilgi" | Plus | ölçüldü 17–18 Ekim; koddan |
| Yazılı deneme | Çoktan seçmeli + açık uçlu | %80 / %20; açık uçlu cevap birebir alıntıyla notlanır | Plus | gözlem 17–19 Ekim |
| Kâğıtta çöz | Var; 90 dk sayaç, en çok 10 fotoğraf | Var; en çok 10 fotoğraf, saklanmaz; model yalnız okur, çözmez | Plus | gözlem 17 Ekim |
| Sözlü deneme | Var | Var | Plus | canlı 24 Ekim; koddan |
| Sesli konuşma | "Astra AI ile konuş", dikte | Sesli tur | v2 herkes, v3 Plus | canlı 24 Ekim; koddan |
| AI öğretmen sohbeti | Var; çizim, matematik klavyesi, dikte | Var; 3 mod; belge ve fotoğraf eklenir | Herkes | canlı 24 Ekim; koddan |
| Fotoğraftan / yazılı soru çözücü | Var | Var; iki ayrı çözüm + kodla hesap kontrolü + arkada denetçi; emin değilse söyler | Herkes (ücretsizde günde 3; v3'te 1) | ölçüldü 23 Ekim |
| Günü gelen tekrar (1-3-7-14 gün) | "Tekrar" etkinliği; tarihe bağlı kanıt yok | Var; yolu kilitlemez, kredisiz | Herkes | gözlem 23 Ekim; koddan |
| Yanılgı takibi | Görülmedi | Var | Herkes | koddan |
| "Hazırsın" | Görülmedi | Var; notlanmış yazılı deneme hedef puanda ya da üstünde olmalı | Plus (yazılı deneme ücretsizde kapalı; v2 ve v3) | koddan |
| Yanlışlar defteri | Görülmedi | Var, kredisiz | Herkes | koddan |
| Hazırlık yüzdesi, tempo kartı | Var; taban %2 | Var; %0, ilerleme varsa en az %1 | Herkes | ölçüldü 19 Ekim |
| Test sonucu ekranı | Doğru şık yeşil, "+%X kazandın", zorluk kaydırıcısı | Aynı; ayrıca şık şık açıklama, "Eğitmene yaz", "fazla zor gelebilir" bandı | Herkes | ölçüldü 19 Ekim |
| Beceri ağacı | Var | Yok (bilerek, 19 Ekim) | — | gözlem 19 Ekim |
| Yıldızlar, sıralama | Okul / Türkiye / Okullar; günlük bulmaca (+20) | Okul arkadaşları / Türkiye / Okullar, bu hafta / tüm zamanlar (ad + soyad baş harfi + okul), Ayarlar'da gizleme; bulmaca yok | Herkes | canlı 24 Ekim; koddan |
| Düello / okul maçı | Okul maçı | Düello: 7 soru, 20 sn, bağlantıyla, hesapsız | Herkes | koddan |
| Okul paylaşımı | Varsayılan açık | İsteğe bağlı | Herkes (isteğe bağlı) | gözlem 19 Ekim |
| Sınıflar | Görülmedi | `/siniflar`: öğrenci sınıf kurar ya da kodla katılır (öğretmen paneli değil) | Herkes | koddan |
| Lab (oyun, simülasyon, uygulama üretme) | 25 oyun, 38 simülasyon, 8 araç, "Kendin oluştur"; 23 Ekim'de 7 yeni | Yok (bilerek, 11 Eylül ve 17 Ekim kararı) | — | canlı 24 Ekim |
| Araçlar | Lab içinde 8 araç | 16 kart: 4 hesap aracı + 12 kısayol | Herkes | canlı 24 Ekim; koddan |
| Veli hesabı, öğretmen programı | Var: veli hesabı (çocuğun etkinliği), öğretmenlere 1 yıl ücretsiz Plus, okul lisansı | Yok (29 Ağustos'ta kaldırıldı) | — | canlı 24 Ekim |
| Mobil uygulama | Play'de TWA (siteyi kendi kabuğunda açan paket, `co.astra_ai.app.twa`); App Store'da da var (yerel mi, doğrulanmadı) | Ana ekrana eklenebilen web uygulaması (375 px'te ~116 sayfa denetlendi); Android paketi kodda hazır, Play Console adımları ürün sahibinde. Gerçek fark: mağazada bulunmak, mağaza puanı, bildirim | — (mağazada yok) | canlı 24 Ekim; eski 19 Eylül (`MAGAZA-UYGULAMASI.md`); ölçüldü 18 Ekim |
| Focus mode | Plus'ta | Yok | — | canlı 24 Ekim |
| Öğrenme tercihleri | Disleksi dostu okuma, öğretmen sesi, ilgi alanları, günlük dakika hedefi | Ruh hali (günde bir), "Nasıl çalışmayı seversin?"; disleksi modu ve ses seçimi görülmedi | — (disleksi, ses seçimi) | canlı 24 Ekim |
| Notu PDF / Word indir | Var (22 Ekim) | Yok: kodda yalnız fiyat kaydı var (`EXPORT_PDF`, 0 kredi), öğrenciye açık indirme düğmesi bulunmadı; kâğıtta çözde sınav kâğıdı yazdırılır | — (yazdırma Plus'ta) | canlı 24 Ekim; koddan (24 Ekim yeniden bakıldı) |
| Resimle başlayan açıklama | Var (21 Ekim) | Görülmedi | — | canlı 24 Ekim |
| Öğrenme süresi, tasarruf kartı | Sitede geçen her dakika; saat ~₺660 | Yalnız aktif süre; saat ₺500 | Herkes | koddan (Astra: gözlem 30 Eylül) |
| Tasarım | Figtree, JetBrains Mono, koyu palet | Yazı tipi ve palet birebir aynı (17 Ekim); 3B simgeler bize özgü | Herkes | koddan |

**Yalnız Astra'da:** Lab, mağaza uygulaması, Focus mode, hazır içerikli resmî sınav programları ve müfredat
içeriği (sayfaları bizde de var, içerik yok), veli hesabı ve öğretmen programı, beceri ağacı, günlük bulmaca,
disleksi modu, öğretmen sesi seçimi, notu PDF / Word'e indirme, resimle başlayan açıklama, bağlantı/makale ve
video ders kaynağı yükleme, gerçek MP4 video, sohbette çizim ve matematik klavyesi, Sigma'da "öncelikli yanıt"
(pazarlama sözü), para iadesi garantisi.

**Yalnız bizde:** haftalık plan, sonuca göre değişen yol, sıradaki dersin önceden yazılması, günü gelen
tekrar, yanılgı takibi ve "Hazırsın", yanlışlar defteri, testte her şıkkın ayrı gerekçesi, derste ve
sohbette belgede olmayan bilginin etiketlenmesi (podcast'te 23 Ekim'den beri ders kitabı nedeni etiketsiz;
sayı, eşik ve sınıflandırma yine yalnız kaynaktan), sohbette belge modları, soru çözücüde kodla hesap
kontrolü, bağlantıyla hesapsız katılınan düello.

---

## 6. İçerik kalitesi

"Kör kıyas": yargıç hangi ürünün metnini okuduğunu bilmez; her çift iki sırayla okunur. Dört "göz" var:
**öğrenme** (öğrenme bilimi), **sınav** (sınav koçu), **öğrenci** (19–23 yaşında, konuyu bilmeyen öğrenci
rolündeki model), **sadakat** (kaynağa bağlılık). **Yargıçlar ve öğrenciler yapay zekâ ajanıdır; gerçek
öğrenci ölçümü yok (beta henüz açılmadı).** Bütün kör ölçümler aynı belge setinde (Pediatri, KPSS Anayasa,
trigonometri).

### Genel puan tablosu (23 Ekim, 14 alan, 10 üzerinden) — ders, test, podcast kör ölçümden; öbür alanlar değerlendirme

Tablo bizim ajanımızın yargısı. Yalnız ders, test ve podcast satırları kör ölçüme dayanıyor; öbür 11 alan
ölçülmüş farklara (süre, çalışıyor/çalışmıyor, var/yok) bakılarak verilmiş puan, ölçüm değil. "Kart, D/Y,
sözlü, yazılı" satırında Astra tarafında hiç ölçüm yok.

| Alan | Cortex | Astra | Alan | Cortex | Astra |
|---|---|---|---|---|---|
| Belge ve konu haritası | 7 | 7 | Kart, D/Y, sözlü, yazılı | 7 | 7 |
| Kurulum ve yol | 8 | 7 | Sohbet | 8 | 7 |
| Ders | 8 | 6 | Tekrar ve "Hazırsın" | 8 | 5 |
| Test | 8 | 7 | Oyunlaştırma | 7 | 8 |
| Podcast | 5 | 8 | Hız | 8 | 6 |
| Video | 6 | 7 | Fiyat ve ücretsiz (v2'ye göre) | 8 | 7 |
| Tasarım ve telefon | 7 | 8 | Diğer | 7 | 7 |

Eşit ağırlıklı ortalama (yalnız yol gösterici, anlamı sınırlı): Cortex 7,3 · Astra 6,9. Öğretim çekirdeği
(ders + test + podcast): Cortex 7,0 · Astra 7,0. "Fiyat" satırı v2 kredisine göre verildi; v3'ten sonra yeniden
puanlanmalı. Podcast puanı 21–29. podcast turlarından önce yazıldı.

### Ders

| Tarih | Ölçüm | Cortex | Astra | Dayanak |
|---|---|---|---|---|
| 16 Ekim | 0–12 puan, aynı 10 sayfalık Pediatri PDF'i | 10 | 10 | ölçüldü |
| 18–19 Ekim | 100 puanlık ilk ders (kapsam 25, doğruluk 20, önemli nokta 15, soru 15, akılda kalıcılık 15, hız 10) | Trig 80, KPSS 88; Pediatri ~84 (düzeltmelerden sonra tahmin, doğrulanmadı; ölçülen 64'tü) | Trig 81, KPSS 78, Pediatri 72 | ölçüldü (kör değil; puanın 10'u hız) |
| 20 Ekim | Kör 1. tur (tek örnek, eski motor) | Doğrulukta önde; sınav gözünde ders bizde | Öğretmede önde: Pediatri dersleri iki sırada, Pediatri testi, podcast; her derste daha çok soru, yanlıştan sonra hedefli ikinci soru, somut vaka | ölçüldü (`AGENTS.md` + 2. tur belgesi; 1. turun kendi belgesi repoda yok) |
| 22–23 Ekim | Kör 2. tur, 9 ders çifti × 2 sıra (Cortex'in kazandığı yargı, ortalama fark Cortex − Astra) | Öğrenci 4/18 (−3,5), öğrenme 12/18 (+6,3), sınav 18/18 (+17,0), sadakat 18/18 (+24,0) | — | ölçüldü |
| 23 Ekim | Kör 3. tur, 9 ders çifti × 2 sıra (aynı ölçü) | Öğrenci 15/18 (+4,6), öğrenme 17/18 (+11,0), sınav 17/18 (+18,7), sadakat 18/18 (+27,2) | — | ölçüldü (yerel) |
| 23 Ekim | Kör 4. tur ("Neden böyle?" kutusu zorunlu + öğretim turu, eşik ≤3) | Öğrenci 13/18, öğrenme 18/18, sınav 18/18, sadakat 18/18 | — | ölçüldü (yerel) |
| 23 Ekim | "Öğrenci" sınavı: yalnız bir ürünün malzemesini okuyan ajan, 5 çift × 15 soru | 61/75 | 31/75 | ölçüldü |

- **2. turun 80 yargılık toplamı** (9 ders + 1 podcast çifti; Cortex kazandı / kaybetti / berabere, ortalama
  Cortex / Astra): sadakat 20/0/0 (81,7 / 58,8), sınav 18/2/0 (70,3 / 56,0), öğrenme 12/6/2 (59,7 / 55,5),
  öğrenci 4/12/4 (60,1 / 65,6). Astra'nın sınav gözünde aldığı 2 yargı podcast çiftinden.
- **Yayındaki ders kodu kör ölçülmedi.** 4. turdan sonra ürün sahibi değiştirdi (#390): döngüsel "Neden böyle?"
  kutusu çıkar, yenisi istenmez; öğretim puanı eşiği <3. 3. ve 4. turda Astra tarafı 22 Ekim içeriği
  (yeniden üretilmedi), Cortex tarafı canlı kodla yerelde üretildi. 2. turda Cortex tarafı canlıdandı.
- **Öğrenci sınavı kısmen kapsam ölçüsü.** Sorular kaynak belgeden yazıldı ve her cevap malzemeden birebir
  alıntı istedi: belgeyi daha çok kapsayan malzeme ödüllendiriliyor, Astra'nın belgede olmayan (çoğu doğru)
  bilgisi puan getirmiyor. Beslenme çiftinde Astra'nın dersi belgenin komşu bölümünü (büyüme/alarm) anlatıyordu;
  o çift çıkınca Cortex 46/60 · Astra 28/60 (hesap).

Öğrenci sınavı konu konu (Cortex / Astra): Pediatri büyüme 15/12, beslenme 15/3, KPSS kuvvetler 9/5,
demokratik devlet 14/8, trigonometri özel açılar 8/3. Hiç çalışmamış ajan 0. Bizim malzemede yanlış cevap
yok; fark "bilmiyorum" cevaplarından.

4. turda dersin tamamının yazım süresi (ortanca) 78 sn'den 118 sn'ye uzadı. İlk ekran yine kavram kavram
geliyor.

- **Bizim önde olduğumuz yer:** kaynağa sadakat. Astra belgede olmayanı kaynaktan gibi veriyor: bal / 1 yaş
  botulizm, "6. aydan sonra", pika "metinde açıkça belirtilmiştir" (16 Ekim); testte belgede olmayan DSÖ
  eşikleri (17 Ekim); videoda belgede olmayan eşikler; sınav setinde etiketsiz enzim bilgisi (20 Ekim).
- **Astra'nın önde olduğu yer:** derste daha çok soru (18–19 Ekim: KPSS 5 + 5, trig 7 + 5; bizde o ölçümde
  3 + konu testi; 20 Ekim'den beri ekran başına bir soru, yeniden sayılmadı); 2. turda derslerde öğrenci
  gözü (Cortex 4/18; podcast dahil 20 yargının 12'si Astra'da).
- Astra'da görülen hatalar: gelişim yaşlarını liste numarası sandı ("2/6/9 ay" → "1/2/3 Ay"); KPSS'te bir
  açıklama cümlesi bozuk (18–19 Ekim). Aynı sıra sayısı hatası bizde de vardı, düzeltildi.

### Test

Testi ayrı puanlayan kör ölçüm yok; 2. turda test, dersle aynı çiftin içinde okundu.

| Tarih | Ölçüm | Cortex | Astra |
|---|---|---|---|
| 16 Ekim | 0–12 puan, Pediatri konu testi | 11 | 10 |
| 20 Ekim | Kör 1. tur, Pediatri testi | Geride (tablo satırlarını aynı kalıpla sordu; 20 Ekim'de düzeltildi) | Önde |
| 22–23 Ekim | 2. tur, ders + konu testi çiftleri, sınav gözü | 18/18 | 0/18 |
| 23 Ekim | Puan tablosu (değerlendirme) | 8/10 | 7/10 |

Astra testinde görülenler (16 Ekim): "Yalnızca …" diye ipucu veren şık, aynı dört şık üç soruda, şık
gerekçesi yok. 17 Ekim: çok cevaplı soru belgede olmayan DSÖ eşiklerini soruyordu.

Bizim testte görülenler: 20 Ekim'de tablo satırları tek kalıpla soruluyordu; 22 Ekim'de aynı testte neredeyse
aynı iki soru ve cevabı ele veren kök (ikisine de kural eklendi: `quizSetIssues`, `TOPIC_TEST_RULE`).

### Podcast — en büyük açığımız

| Tarih | Ölçüm | Cortex (öğrenme / sınav / öğrenci / sadakat) | Astra |
|---|---|---|---|
| 16 Ekim | 0–12 puan | 8 | 11 |
| 22–23 Ekim | Kör 2. tur, tek çift (Soru-Cevap) | 45–58; yalnız sadakatte önde | 60–73 |
| 23 Ekim | Kör 3. tur, öğrenci gözü | Diyalog 48–50, Soru-Cevap 53–55 | 75 ve 72–76 |
| 23 Ekim | 6. ölçüm | 44 / 62 / 48 / 78 | 57 / 67 / 74 / 62 |
| 23 Ekim | 21. ölçüm (etiketli ders kitabı nedeni) | 57 / 73 / 58 / 84 | 58 / 65 / 73 / 63 |
| 23 Ekim | 22. ölçüm (etiketsiz ders kitabı bilgisi) | 54 / 70 / 60 / 85 | 55 / 63 / 74 / 60 |
| 23 Ekim gecesi | **25. tur — bugün yayındaki yapı** (senarist yazar, luna, orta düşünme), öğrenci gözü; öbür gözler kaydedilmedi | **65** | **72** |
| 23 Ekim gecesi | 28. ve 29. tur (gpt-6-sol; kullanılmıyor), öğrenci gözü; öbür gözler iki turun ortalaması | Öğrenci 66 ve 63; öğrenme 63, sınav 69,5, sadakat 75,5 | Öğrenci 67 ve 71; öğrenme 54, sınav 63,5, sadakat 62 |

- Öğrenci gözünde açık 6. ölçümde 26 puandı (Cortex 48 · Astra 74), bugün 7 puan (Cortex 65 · Astra 72).
  70 hedefi tutmadı.
- Sınav ve sadakat gözünde öndeyiz (22. ölçüm ve 28–29. turlar; yayındaki 25. turun bu gözleri kaydedilmedi).
  Sol turlarında sadakat 85'ten 75,5'e düştü: etiketsiz ders kitabı bilgisi.
- Yargıç turdan tura oynuyor: Astra'nın aynı podcast'i 67 ile 75,5 arasında puan aldı.
- **Fark nereden:** Astra 2–4 cümlelik doğal sıralarla konuşuyor, nedenleri ders kitabından ekliyor,
  bazı satırları atlıyor. Bizimki bütün satırları doğru taşıyor ama "sesli okunan tablo" gibi.
- Süre: Astra Pediatri 4:45 (18 Ekim). Bizde Pediatri 6:32 (18 Ekim), trig 5:26, KPSS 5:10 (19 Ekim).

### Soru çözücü, sohbet, video

| Konu | Cortex | Astra | Dayanak |
|---|---|---|---|
| Soru çözücü, 10 dersten 10 soru | 10/10, hepsi denetçi onaylı (yerel koşu, bizim yazdığımız 10 soru) | 10/10 (canlı, Plus hesabı) | ölçüldü 23 Ekim; iki ürüne aynı 10 sorunun verildiği yazılmamış |
| Belgeyle sohbet (KPSS, 0–12) | 12 (9 Ekim'de 11) | 10 | ölçüldü 9 ve 16 Ekim; 24 Ekim'deki #396'dan önce |
| Video | 6/10 | 7/10 | puan tablosu 23 Ekim (değerlendirme) |

Astra'nın sohbeti belgede olmayan ayrıntıyı işaretsiz ekliyor. Bizde varsayılan mod "Belgem + genel bilgi";
dış bilgi "Genel bilgiden:" etiketiyle geliyor. **24 Ekim'den beri (#396) sohbetteki genel bilgi cevabı
denetimsiz, tek model çağrısıyla geliyor**; "Genel bilgiden:" kısımları artık denetlenmiyor. Yukarıdaki sohbet
puanı bu değişiklikten önce alındı.

---

## 7. Hız

| İş | Astra | Cortex | Dayanak |
|---|---|---|---|
| Soğuk ders (hazır değilken) | ~40–45 sn, hepsi birden (43,5 sn Pediatri) | Canlı (18–20 Ekim): ilk ekran 13–15 sn (hızlı işlemle); ücretsizde normal işlemde 18,4 sn; ısınmayla 4–6 sn (hızlı işlemle). Yerel (22–23 Ekim, canlı kod): ilk ekran 17–28 sn ve 15–35 sn, iki derste 42–49 sn. Dersin tamamı 111–222 sn (4. turda ortanca 118 sn); öğrenci okurken gelir | ölçüldü 18–20 Ekim; ölçüldü (yerel) 22–23 Ekim |
| Hazır ders | Yok: sıradaki dersi önceden yazmıyor, açılınca yine 43 sn | 1,7–3,2 sn | ölçüldü 18–20 Ekim |
| Hazır konu testi | 0,3 sn (dersle birlikte yazılıyor) | 1,3 sn (18 Ekim). 20 Ekim'den beri test ders kaydedildikten sonra derse göre yeniden yazılıyor; hazır test süresi yeniden ölçülmedi | ölçüldü 18 Ekim |
| Soğuk test (5 soru) | ~15 sn | 18 sn (önce 36 sn; 19 Ekim, 20 Ekim'deki derse bağlı test kurallarından önce) | ölçüldü 19 Ekim |
| Soğuk podcast | 43 sn (18 Ekim), ~47 sn (19 Ekim) | Eski yapı (19 Ekim): trig ~40 sn, KPSS 51,9 sn; Araçlar'da 5 dk diyalog 37 sn. Bugünkü yapıda (senarist yazar + 5 soruluk dinleme kontrolü; podcast kontrol bitmeden dönmüyor) canlıda ölçülmedi; yerelde 23 Ekim ölçümlerinde 200–226 sn, gpt-6-sol senaristle 224–243 sn. Bugünkü soğuk süre büyük olasılıkla Astra'nın birkaç katı. Yolda sıradaki podcast önceden yazıldığı için çoğu zaman hazır açılır | ölçüldü 18–19 Ekim; ölçüldü (yerel) 23 Ekim; koddan (`teacher-podcast-run.ts`) |
| Fotoğraftan soru çözümü | Sözel 3–10 sn, işlemli 17–27 sn (canlı, Plus) | Yerel koşu (yükleme, sunucu rotası ve ekran hariç): Plus ilk çözüm 2,9–5,1 sn, onay en çok 7,2 sn. Ücretsiz: ilk çözüm 5,6–9,5 sn, onay en çok 10,7 sn | ölçüldü 23 Ekim (bizim taraf yerel) |
| 7 dosyanın okunması | ~30 sn | ~76 sn, sırayla | ölçüldü 19–20 Ekim |
| 7 dosyanın konu listesi | ~90 sn | ~105 sn | ölçüldü 19–20 Ekim |
| Hazırlığın kurulması | Ölçülmedi | ~10 sn | ölçüldü 20 Ekim |
| Video ders üretimi | Ölçülmedi | ~160 sn (1 dk video, 19 Ekim); 18 Ekim'de ~35 sn (yalnız oturum notunda) | ölçüldü 18–19 Ekim |
| 10 soruluk yazılı deneme | Ölçülmedi | ~60 sn (önce 280 sn) | ölçüldü 19 Ekim |

Dikkat — bugünkü ayarla ölçülmeyenler:

- Soğuk ders ölçümlerinin çoğu hızlı işlemdeydi. 19 Ekim'den beri hızlı işlem yalnız Plus'ta; 23 Ekim'den
  beri ısınma normal işlemde. Bugünkü ücretsiz ve ısınmalı açılış süresi ölçülmedi; canlı p95
  `/admin/beta`'daki açılış kayıtlarından (`open_timings`) okunmalı.
- Podcast'te senarist yazar ve 5 soruluk kontrol eklendikten sonra luna ile soğuk süre ölçülmedi; Vercel
  günlüğündeki `teacher_podcast` ms'ten okunabilir (yeni model çağrısı gerekmez).
- Hazır ve soğuk test 20 Ekim'deki derse bağlı test değişikliğinden sonra ölçülmedi; `teacher_quiz` ms'ten
  okunabilir.
- Ücretli hesapta artık 3 dosya aynı anda işleniyor; bu canlıda ölçülmedi.

Kalabalık anlar için: aynı anda en çok 40 üretim. Doluysa öğrenci 25 sn bekler, sonra "Şu an yoğunluk var;
sıradasın" görür ve ~3 dk içinde kendiliğinden yeniden denenir (koddan).

---

## 8. Belge işleme ve konu haritası

### Aynı belgeden kaç konu

| Belge | Astra | Cortex | Dayanak |
|---|---|---|---|
| Trigonometri, 20 sayfa | 7 (7 Eylül'de 5) | 10 (önce 1 çıkıyordu, düzeltildi) | ölçüldü 18 Ekim |
| KPSS Anayasa, 30 sayfa | 6 | 16 konu / 10 birim (önce 2) | ölçüldü 19 Ekim |
| Pediatri, 10 sayfa | 10 | 10 (neredeyse aynı harita) | ölçüldü 16 Ekim |
| Sınav seti: 65 s. PDF + 6 s. Word + 5 fotoğraf | 10 geniş konu | 10 ünite / 28 konu | ölçüldü 20 Ekim |

KPSS'te bütün bölümler yolda; ilk ders Cortex 88, Astra 78. "Her sayfa tek konuya" kuralı gevşetilmiyor
(19 Ekim kararı).

### Sınırlar

| | Astra | Cortex | Dayanak |
|---|---|---|---|
| Dosya türleri | Her tür + çoklu resim; ana sayfa: PDF, not fotoğrafı, slayt, ders kitabı, bağlantı/makale, video ders, çıkmış sınav | PDF, TXT, DOCX, PPTX, JPG, PNG, WEBP, HEIC (sohbette HEIC yok); bağlantı ve video kabul listesinde yok | canlı 24 Ekim; koddan |
| Boyut | Görülmedi | PDF 50 MB, öteki 15 MB | koddan |
| Hazırlık başına belge | Görülmedi | 8 | koddan |
| Ücretsiz sayfa | Ölçülmedi | Toplam 5 sayfa | koddan |
| Plus sayfa | "Daha yüksek yükleme limitleri" | Belge başına en çok 1.000; ayda v2 3.600 / v3 1.440 metinli sayfa; taranmış ayda 300 (Sigma 1.000) | koddan |
| Sayfa ücreti | Tek sayaçtan | v2 2 kredi, v3 5 kredi; taranmış sayfa +6 | koddan |

### Okuma kalitesi

- **Word:** Astra 6 sayfalık Word'ü okudu. Bizde 19 Ekim'de 1 sayfa sayılıyordu; düzeltildi, artık 6.
- **İşaretli test fotoğrafı:** eski okuyucumuz şıkların harflerini üç okumada da kaydırdı. Şimdi asıl model
  okuyor: 6/6 soru kâğıtla birebir, öğrencinin işareti "(işaretli)" diye yazılıyor; görsel başına
  ~$0,0005 (önce ~$0,0038). Astra'nın fotoğraf okuması ölçülmedi (20 Ekim).
- **Bozuk metinli PDF** (Calibri glif numaraları): bizde çözülüyor; KPSS notu bu yüzden 2 konuya düşmüştü.
- **Kaynak gösterimi:** Astra "N kaynak" deyip hepsini listeliyor. Biz yalnız kullanılan dosyayı ve sayfayı
  gösteriyoruz ("… .docx · s.1"). İşaretli testteki öğrenci yanlışı derste doğrusuyla ele alındı (20 Ekim).

---

## 9. Ödeme, abonelik, güven

| | Astra | Cortex | Dayanak |
|---|---|---|---|
| Ödeme altyapısı | Stripe | PayTR (iFrame) | canlı 24 Ekim; koddan |
| Yenileme | "Aylık/yıllık faturalandırılır"; "Aboneliği yönet". Otomatik yenileme davranışı ölçülmedi | **Otomatik yenileme yok** — teknik engel: PayTR iFrame'de kart saklama yok; Direkt API + Non3D başvurusu onay bekliyor. Öğrenci için sürpriz tahsilat yok; bizim için elle yenileme ve abone kaybı riski. Dönem bitmeden hatırlatılır; yenilenmezse ücretsize döner, çalışmalar kalır | canlı 24 Ekim; koddan |
| Kart bilgisi | Ölçülmedi | Bize gelmez, saklanmaz | koddan |
| Plan yükseltme | Stripe onay sayfası; Sigma'ya geçişte o gün ₺1.856,13 fark | Ölçülmedi | gözlem 19 Ekim |
| Para iadesi | "Notun en az 2 seviye yükselmezse tam iade" (pazarlama sözü) | Böyle bir garanti yok. Teknik arızada kredi talepsiz iade; hatalı tahsilat karta iade | canlı 24 Ekim; koddan |
| Cayma hakkı | Ölçülmedi | Yok (anında ifa edilen dijital içerik); ödeme adımında onay kutusu | koddan |
| Yasal onay | Görülmedi | Ön Bilgilendirme + Mesafeli Satış onay kutusu | canlı 24 Ekim |
| Veli ödemesi | "Ebeveyninden ödeme yapmasını iste" düğmesi | Velinin kartıyla ödenebilir (SSS'de); ayrı düğme yok | canlı 24 Ekim |
| Satış baskısı | Geri sayım ("BACK TO SCHOOL"), her sayfada "Satın al" | Sahte aciliyet ve indirim sayacı yok. Kapıda hakkın yenilenme saati var (v2 geri sayım, v3 sayacın yenilenme saati); ücretsiz ana ekranda dikkat çekici "Plus'ın bir ayı" kartı | canlı 24 Ekim; eski 3 Ekim; koddan |
| Sosyal kanıt | App Store 4,7, Google Play 4,8, "16.810.000+ öğrenci", Harvard alıntısı | Yok; güven satırları ("Notunda olmayanı uydurmaz", "Kart bilgisi bize gelmez") | canlı 24 Ekim |
| Pazarlama sözleri | "1300 kat", "1,4 kat daha akıllı model", "2 kat hızlı" | Somut sayılar; öğreten işlerde "model her planda aynı" | canlı 24 Ekim |

- Otomatik yenilemenin olmaması bir dürüstlük tercihi değil: kullandığımız PayTR iFrame'de kart saklama yok.
  Direkt API + Non3D başvurusu 8 Ekim'de gönderildi, onay bekleniyor. Onaya kadar hiçbir şey değişmiyor.
- **Bizde bir tutarsızlık:** yasal metnin hizmet tanımı (`src/lib/legal/texts.ts`, satır 61) iki cümleyle
  ürünle çelişiyor: "Hizmet, kredi adı verilen kullanım hakkı üzerinden sunulur" (v3'te ücretsiz hesap kredi
  değil sayaç kullanıyor) ve "her yapay zekâ işleminin kaç kredi harcayacağı … ekranda gösterilir" (ürün
  öğrenciye kredi göstermiyor; aynı cümle 19 Ekim'de pazarlamadan kaldırılmıştı).

### Gizlilik, dil, bildirim, destek, olgunluk

| | Astra | Cortex | Dayanak |
|---|---|---|---|
| Yaş ve veli onayı | Kayıtta yaş adımı ve ebeveyn/vasi izni onay kutusu | Kayıtta yaş ya da veli onayı adımı yok; yalnız sözleşme + KVKK onayı. LGS öğrencisi reşit değil: hukuki inceleme maddesi | eski 11 Eylül; koddan (`kayit/actions.ts`, `signup-wizard.tsx`) |
| Fotoğraflar | Ölçülmedi | Kâğıtta çöz fotoğrafları saklanmaz; soru çözücüde fotoğrafın kendisi sohbete yazılmaz, okunan soru yazılır | koddan |
| Veri yeri | Ölçülmedi | Veritabanı ve fonksiyonlar Frankfurt'ta | koddan (`vercel.json` `fra1`) |
| Hesap silme | Ölçülmedi | Var (`account-deletion.ts`) | koddan |
| Okul paylaşımı | Öğrencinin bütün hazırlıkları okul sayfasında yazar adıyla, varsayılan açık | İsteğe bağlı; sıralamada adı Ayarlar'dan gizleme | gözlem 19 Ekim; koddan |
| Dil | Ölçülmedi | Yalnız Türkçe (`lang="tr"`; `next-intl` paketi kurulu ama kullanılmıyor) | koddan |
| Hatırlatma | Uygulama bildirimi var mı, ölçülmedi | Günde bir e-posta (19:00) | koddan (`/api/cron/study-reminders`) |
| Destek | Ölçülmedi | `/destek` formu; cevap hedefi 24 saatin altı (`/admin/beta`) | koddan |
| Olgunluk ve ölçek | "16.810.000+ öğrenci", mağaza puanları 4,7 / 4,8 | Beta öncesi; kapalı beta kodu henüz açılmadı. Vercel Hobby planında (Hobby ticari kullanımı yasaklıyor; satıştan önce Pro gerekiyor) | canlı 24 Ekim; `MALIYET-VERGI-24-EKIM.md` |

---

## 10. Nerede öndeyiz, nerede gerideyiz, sıradaki işler

### Öndeyiz

1. **Kaynağa sadakat:** her kör turda (2. tur derslerde 18/18, 80 yargının 20/20'si; 3. ve 4. tur 18/18).
2. **Belgeyi kapsama:** belgeden yazılmış 15'er soruluk sınavda (yapay zekâ öğrenci) Cortex 61/75 · Astra 31/75.
   Astra'nın beslenme dersi komşu bölümü anlatıyordu; o çift çıkınca Cortex 46/60 · Astra 28/60. Fark kısmen
   kapsamdan.
3. **Sınav gözü:** derste (testiyle) 17–18/18.
4. **Hazır ders hızı:** Cortex 1,7–3,2 sn · Astra 43,5 sn (sıradaki dersi önceden yazmak Astra'da yok).
5. **Soru çözücü hızı (büyük olasılıkla):** ilk çözüm Cortex 2,9–9,5 sn (yerel) · Astra 3–27 sn (canlı);
   doğrulukta eşit. Canlıda ve aynı sorularla yan yana ölçülmedi.
6. **Takip:** günü gelen tekrar, yanılgı takibi, "Hazırsın" (Plus'ta), sonuca göre değişen yol.
7. **Konu haritası ayrıntısı:** KPSS Cortex 16 · Astra 6; trigonometri Cortex 10 · Astra 7.
8. **Hak ve plan:** Plus'ta mesaj +%20; haftalık plan yalnız bizde; ücretsizde mesaj daha cömert.
9. **Dürüst satış:** öğreten işlerde her planda aynı model, somut sayılar, sahte aciliyet ve indirim sayacı yok.

### Gerideyiz

1. **Podcast, öğrenci gözü:** Cortex 65 · Astra 72 (yayındaki yapı). Açık kapanıyor ama 70 hedefi tutmadı.
2. **Ürün genişliği:** Lab, mağaza uygulaması, hazır içerikli resmî sınavlar ve müfredat, veli hesabı,
   öğretmen programı, Focus mode, disleksi modu, bağlantı ve video kaynağı yükleme.
3. **v3 sonrası fiyat:** aylıkta ₺16 pahalıyız, yıllık plan yok; derste geride (yalnız ders ayda 240, Astra'nın
   aralığının alt ucu; ders + test 180, Astra ≈220–380).
4. **Test hızı:** hazır test Cortex 1,3 sn · Astra 0,3 sn; soğuk test Cortex 18 sn · Astra ~15 sn (20 Ekim'den
   önce ölçüldü).
5. **Soğuk podcast süresi (büyük olasılıkla):** bugünkü yapıda podcast dinleme kontrolü bitmeden dönmüyor;
   yerelde Cortex 200–243 sn · Astra 43–47 sn. Canlıda ölçülmedi.
6. **Çok dosya okuma:** Cortex ~76 sn · Astra ~30 sn (paralel yüklemeden sonra ölçülmedi).
7. **Ücretsizde açık özellik türü:** Astra ücretsizde podcast ve Lab açıyordu (12 Eylül); bizde podcast, sözlü,
   yazılı deneme, video (v3'te ses de) Plus'ta.
8. **Derste soru sayısı (doğrulanacak):** Cortex 20 Ekim'den beri ekran başına 1 (sayılmadı) + konu testi ·
   Astra 5–7 + 5 soruluk test. Kör ölçümde buna rağmen öndeyiz.
9. **Güven sinyali:** mağaza puanı, kullanıcı sayısı, para iadesi garantisi bizde yok. Otomatik yenileme yok
   (teknik engel; elle yenileme abone kaybı riski).
10. **Ders, öğrenci gözü:** 4. turda 13/18; tam değil.

### Belirsiz (ölçülmeli)

- **Soğuk ders açılışı:** Cortex ilk ekran canlıda 13–19 sn, yerelde 15–35 sn (en kötü 42–49 sn) · Astra
  dersin tamamı ~40–45 sn. Bizde dersin tamamı 111–222 sn (öğrenci okurken geliyor). `/admin/beta`'daki
  `open_timings` (cold) p95 okunana kadar üstünlük sayılmıyor.

### Kapanmış kararlar — yeniden açmayın

Lab (11 Eylül, 17 Ekim) · veli ve öğretmen paneli (29 Ağustos) · beceri ağacı (19 Ekim) · okul paylaşımı
isteğe bağlı (19 Ekim) · konu sayısını gevşetmemek (19 Ekim) · podcast yalnız luna, gpt-6-sol yok (23 Ekim) ·
kampanya bandı şimdilik yok (3 Ekim). Genel kural (4 Eylül): "Astra'da var" tek başına iş gerekçesi değil;
özellik öğrenciye bir şey öğrettiği için yazılır.

### Önerilen sıradaki işler (yalnız kanıttan)

1. **Podcast öğrenci gözü (Cortex 65 · Astra 72).** En büyük kalite açığı. Kalan fark: Astra bazı basamakları
   atlayıp rahat bir sohbet kuruyor, bizimki bütün satırları taşıyor. Denenip tutmayanlar
   `PODCAST-OLCUM-23-EKIM.md`'de; onlar tekrarlanmasın. Bugünkü podcast'in soğuk süresi Vercel günlüğündeki
   `teacher_podcast` ms'ten ölçülmeli (yeni model çağrısı gerekmez).
2. **v3'ten sonra fiyat konumu.** Derste (ders + test) gerideyiz, yıllık kalkıyor, aylıkta ₺16 pahalıyız. Fiyat
   üstünlüğü yalnız mesajda kanıtlı (+%20); fotoğrafta Astra ölçülmedi. 23 Ekim tablosundaki "fiyat 8/7" v2'ye
   göre; v3'le yeniden puanlanmalı.
3. **Bugünkü ayarla açılış süreleri.** Ücretsizin soğuk dersi, normal işlemdeki ısınma, hazır ve soğuk test.
   Beta hedefi p95 < 20 sn; `/admin/beta`'daki açılış kayıtlarından ve `teacher_quiz` ms'ten okunabilir (yeni
   model çağrısı gerekmez).
4. **Paralel yüklemeyi canlıda ölç** (Cortex sırayla 76 sn · Astra 30 sn).
5. **Yasal metni düzelt:** `texts.ts` satır 61'deki iki cümle de düzelsin: kredi ekranda gösterilmiyor ve v3'te
   ücretsiz hesap kredi değil sayaçla çalışıyor.
6. **Astra'yı yeniden ölç.** Önce ücretsiz katmanı ücretsiz hesapla (bedeli 0): ders hakkı, fotoğraf, açık
   özellik türleri. Plus ölçümünde Astra'nın ders yüzdesine dersle yazılan testin girip girmediği de bakılsın.
   Plus test hesabı bugün bitiyor; Plus ölçümleri yenileme ister, karar ürün sahibinde.
7. **Canlı yan yana ölçümler:** soru çözücü `cortexplus.app` üzerinde ve Astra'yla aynı sorularla; belgeyle
   sohbet #396'dan sonra; derste soru sayısı (3. ve 4. turun 9 dersi ya da canlı kayıtlar).
8. **Kayıtta yaş ve veli onayı:** Astra soruyor, biz sormuyoruz; reşit olmayan öğrenci için hukuki inceleme.
9. **Mobil uygulama:** Android paketi hazır; Play Console adımları ürün sahibinde.
10. **Astra'nın yeni eklediği özellikler** (hazır içerikli resmî sınav programları, müfredat içeriği, notu PDF /
    Word'e indirme, resimle başlayan açıklama, disleksi modu): öğrenciye bir şey öğrettiği gösterilirse
    değerlendirilir.

---

## 11. Kaynaklar ve ölçüm tarihleri

| Tarih | Kaynak |
|---|---|
| 24 Ekim | Canlı sayfalar: Astra `/pay`, Profil (Kullanım, Abonelikler, Ayarlar), `/lab`, `/exam-preps/official`, `/exam-preps/curriculum`, Yenilikler, `astra-ai.co`; `cortexplus.app` ana sayfa, `/pay`, `/fiyatlandirma`, `/ozellikler`. Kod: `price-table.ts`, `free-meters.ts`, `plan-value.ts`, `free-tier-copy.ts`, `model-router.ts`, `learning-tracking.ts`, `stars-dialog.tsx`, `teacher-lesson.ts`, `teacher-podcast-run.ts`, göçler `20260904000000`, `20260918130000`, `20261024120000`–`20261024123000`; v2 için `origin/main` (5da1857e) |
| 22–24 Ekim | `cortex-plus/docs/delivery/`: `MALIYET-VERGI-24-EKIM`, `ASTRA-KARSILASTIRMA-23-EKIM`, `OGRETIM-KALITESI-OLCUM-2-22-EKIM`, `-3-23-EKIM`, `PODCAST-OLCUM-23-EKIM`, `SORU-COZUCU-23-EKIM`, `OZELLIK-DENETIMI-19-EKIM`; `docs/delivery/KREDI-SISTEMI.md` |
| 16–20 Ekim | `SINAV-SETI-KARSILASTIRMA-20-EKIM`, `DERS-HIZI-18-EKIM`, `ASTRA-TUR-19-EKIM`, `SATISA-HAZIRLIK-PLANI`, `ICERIK-KALITE-YOL-HARITASI` §8–10, `ASTRA-YAN-YANA-17-EKIM`, `TASARIM-ASTRA-17-EKIM`; 1. kör tur için `AGENTS.md` "Öğretim kalitesi (20 Ekim 2026)" |
| 3–8 Ekim | Astra ücretsiz hesap (3 Ekim, `AGENTS.md`); Astra Plus kullanım yüzdeleri (8 Ekim, `KREDI-SISTEMI.md` v2) |
| 7–19 Eylül | `docs/astra-tier-parity-2026-09-11/` (`TIER_MATRIX`, `DELTA`, `REPORT`), `ASTRA-PDF-OBSERVED-FLOW-2026-09-07`, `TRIGONOMETRY-PDF-COMPARISON-2026-09-07`, `MAGAZA-UYGULAMASI` (eski) |

Arşiv klasörleri (`docs/astra-parity/`, `docs/astra-audit/`) kullanılmadı.

### Açık kalan ve doğrulanmamış noktalar

**Çelişkiler ve hangisinin alındığı:**

- **Astra Plus aylık fiyatı:** aylık sekmede ₺583, yıllık sekmede üstü çizili ₺599; 8 Ekim'de ₺599 idi.
  Bugünkü aylık sekme (₺583) alındı.
- **Astra haftalık planı:** 14 Eylül tarihli kod yorumu ₺450 diyor; 8 Ekim ve 24 Ekim'de yok. "Yok" alındı.
- **Podcast sonrası soru:** 23 Ekim karşılaştırması "dinleme kontrolü yalnız bizde" diyor. Daha yeni
  `PODCAST-OLCUM-23-EKIM.md` Astra'nın 5 sorusundan söz ediyor; 24 Ekim vitrini de "sohbet, sonra kısa bir
  testle" diyor. Astra'da da var diye alındı.
- **Video stilleri:** 23 Ekim karşılaştırması 5 stili Astra'nın üstünlüğü gibi yazmış; kodda aynı 5 stil
  bizde de var. Gerçek fark MP4 ile oynatıcıda birleşme.
- **Öğrenci sınavı:** 2. tur tablosu toplanınca 62/32, 3. tur 61/31. 3. tur alındı.
- **v2'de davet:** bir okuma "v2'de davetin karşılığı yalnız yıldız" diyordu. Kod (`referral_tiers`;
  `20260904000000`, sonra `20260918130000`) v2'de çarpanı 3 / 10 olarak gösteriyor: 400, 18 Eylül'de 10'a
  indirildi. Kod alındı; yıldız ödülü ayrıca var.
- **1. kör tur:** ilk taslakta "3/5 çift" sütunları yön belirtmeden "bizim kazandığımız çift" diye okunmuştu.
  `AGENTS.md`'ye göre sonuç "doğrulukta öndeyiz, öğretmede değil"; 2. tur belgesi de "20 Ekim: Pediatri
  derslerinde iki sırada Astra" diyor. Bu alındı.
- **Sınav gözü "18/20":** 2. tur belgesi bunu testin satırına yazmış; sayı 10 çiftin (9 ders + konu testi,
  1 podcast) toplamı. Derslerde 18/18, podcast'te Astra 2/2 diye alındı.
- **Video üretim süresi:** 18 Ekim'de ~35 sn (yalnız oturum notunda), 19 Ekim denetiminde ~160 sn. Daha yeni
  olan alındı.
- **Astra'da veli paneli:** 4 Eylül'de "yok" denmişti; 11 Eylül'de kayıtta ebeveyn/öğretmen rolü görüldü;
  24 Ekim'de veli hesabı ve öğretmen programı var.
- **Lab büyüklüğü:** 23 Ekim belgesinde 34 simülasyon / 11 oyun; bugün 38 simülasyon / 25 oyun.
- **Araç sayısı:** `AGENTS.md` "12 araçlık /araclar" diyor; kodda 16 kart var (4 hesap aracı + 12 kısayol).

**Doğrulanmamış (bu raporda iddia edilmiyor):**

- Astra'nın 8 Ekim ders yüzdesine dersle birlikte yazılan testin girip girmediği.
- Astra'nın fotoğraf çözümü başına harcaması; bu yüzden fotoğrafta fiyat kıyası yok.
- Astra'nın ücretsizde hangi modeli kullandığı (ilk taslakta "küçük model" yazıyordu; kaynağı bulunamadı).
- Astra'nın iOS uygulamasının yerel mi, Android'deki gibi web kabuğu mu olduğu.
- Soru çözücüde iki ürüne aynı 10 sorunun verilip verilmediği.
- Video üretiminin 18 Ekim'deki ~35 sn'si (yalnız oturum notunda, repo belgesinde yok).
- Pediatri ilk dersinin ~84 puanı (tahmin; ikinci konu ölçümü yapılmadı).

**Ölçülmeyenler:**

- Astra: ek paket fiyatı (satın alma akışı açılmadı); otomatik yenileme, iade ve cayma süreci; Plus'ta test,
  kart, podcast, video, sayfa sayısı; ücretsizde ders hakkı ve fotoğraf çözümü; fotoğraf okuma doğruluğu;
  uygulama bildirimi, destek, dil seçenekleri. Ücretsizdeki özellik kapısı 12 Eylül'den, mesaj hakkı 3 Ekim'den
  beri yeniden ölçülmedi.
- Cortex: bugünkü ayarla ücretsiz soğuk ders, normal işlemdeki ısınma, senarist yazar + kontrollü soğuk
  podcast (luna), 20 Ekim sonrası hazır ve soğuk test, 3 dosyalı paralel yükleme, #396 sonrası belgeyle sohbet,
  soru çözücünün canlı süresi, 20 Ekim sonrası derste soru sayısı. Yayındaki ders kodu (#390) kör ölçülmedi.
  Hazır resmî sınav içeriği, müfredat içeriği, disleksi modu, notu indirme ve resimle başlayan açıklamanın
  karşılığı bu turda görülmedi.
- Gerçek öğrenci: elde tutma, tekrar doğruluğu, ders sonu puanı, haftalık anket. Beta açılınca `/admin/beta`'dan.

**Yöntem uyarıları:**

- Yargıçlar ve öğrenciler yapay zekâ ajanı; kendi ürünümüzü kendi ajanımız yargılıyor.
- Kör ölçümler tek belge setinde (Pediatri, KPSS Anayasa, trigonometri).
- Yargıç modeli 3. turda değişti: Astra'nın aynı malzemesi 64,8'den 59,4'e düştü. Tek turda oynaklık ±5 puan.
- Öğrenci sınavı kaynaktan yazıldı ve birebir alıntı istedi; Astra'nın bazı dersleri belgenin komşu bölümünü
  anlatıyordu. Sayı kısmen kapsam ölçüsü.
- Astra'nın kullanım yüzdeleri tek hesapta, tek seferde ölçüldü.
- Astra Plus test hesabının süresi bugün (24.10.2026) bitiyor; sonraki ölçümler ücretsiz hesapla ya da
  yenilemeyle yapılabilir.

**Kodda görülen küçük tutarsızlıklar (bu raporda düzeltilmedi):** `src/lib/legal/texts.ts` satır 61 (9. bölüm);
`subscription-cards.tsx` yorumu "Sigma'da gelişmiş model" diyor ve `entitlements.ts` Sigma'yı hâlâ
`modelTier: "advanced"` diye işaretliyor, oysa öğreten işler bütün planlarda aynı modelde (yalnız 10 sayfadan
uzun belge işlemede abone gpt-4.1 alıyor); `tier-presentation.ts` içindeki `parentPlusBenefitLines` emekli veli
akışından kalmış görünüyor; `price-table.ts`'te öğrenciye açık karşılığı olmayan `EXPORT_PDF` kaydı;
`kayit/actions.ts` şemasında emekli veli ve öğretmen alanları duruyor.

---

## Sözlük

| Terim | Anlamı |
|---|---|
| luna (gpt-6-luna) | Asıl model; bütün öğreten işler bununla |
| gpt-6-sol | Daha büyük model; podcast'te denendi, kullanılmıyor (ürün sahibinin kararı) |
| hızlı işlem | Aynı modelin iki kat fiyatlı hızlı yazımı; yalnız ücretli planlarda, hazır içerik yokken |
| önceden yazım | Yoldaki sıradaki iki adım arka planda hazırlanır; kredi öğrenci açınca düşer |
| ısınma | Öğrenci ders adımını açınca, "Ders oluştur"a basmadan ders arkada yazılmaya başlar |
| hazır / soğuk | Hazır: önceden yazılmış, hemen açılır. Soğuk: açılınca yazılıyor |
| düşük / orta düşünme | Modelin cevaptan önce ne kadar düşüneceği ayarı (`reasoning_effort`) |
| senarist yazar | Podcast'i kısa bir tarifle düz senaryo olarak yazan istem (23 Ekim) |
| göz | Kör kıyasta bir yargıç bakışı: öğrenme, sınav, öğrenci, sadakat |
