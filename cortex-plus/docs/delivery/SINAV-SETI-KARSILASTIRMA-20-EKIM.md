# Sınav seti: Cortex ile Astra yan yana (19–20 Ekim 2026)

Ürün sahibinin isteği: "5 fotoğraf, 65 sayfa PDF ve 6 sayfalık Word; aynı ya da bağlantılı konu; 25 gün
sonraki sınav için tam olarak Astra gibi kur, aynı belgeleri yükle, karşılaştır; eksikleri çıkar ve
tamamen hallet." Bu belge son karşılaştırmadır; set `tests/fixtures/sinav-seti/` altında (README'de her
dosyanın yalnız kendisinde olan bilgi yazılı).

## Set

| Dosya | İçerik | Yalnız bu dosyada |
|---|---|---|
| `AYT-Biyoloji-Insan-Fizyolojisi.pdf` (65 s.) | 8 ünite: sinir, endokrin, duyu, destek-hareket, sindirim, dolaşım-bağışıklık, solunum, boşaltım | — (çekirdek) |
| `Homeostazi-Son-Tekrar-Notu.docx` (6 s.) | geri bildirim döngüsü, su-tuz/ANP, kan şekeri-pH-kalsiyum, 12 sık hata, kendini dene, 25 günlük plan | ANP, asidoz/alkaloz, 25 günlük plan |
| `Defter-Kalp-Uyari-Iletimi-EKG.jpg` | SA→AV→His→Purkinje, EKG dalgaları | PR 0,12–0,20 sn; QRS < 0,12 sn |
| `Tahta-Aksiyon-Potansiyeli.jpg` | −70/−55/+30 mV, pompa | mutlak/göreceli refrakter |
| `Defter-Nefron-Idrar-Olusumu.jpg` | süzülme → geri emilim → salgılama | 180 L süzüntü → 1,5 L idrar |
| `Test-14-Homeostazi-Isaretli.jpg` | 6 soru, 6 ayrı konu | öğrencinin yanlışları: ADH (2) ve CO₂ taşınması (6) |
| `Kart-Hipofiz-Hormonlari.jpg` | ön/arka hipofiz | "FLAT PiG" ezber kodu |

## Kurulum

| | Astra (hazırlık 10168652) | Cortex (hazırlık 58d065e9, düzeltmelerden sonra) |
|---|---|---|
| 7 dosyanın okunması | ~30 sn | ~76 sn sırayla; artık ücretli hesapta 3 dosya aynı anda (yayından sonra ölçülecek) |
| Konu listesi | ~90 sn; 10 geniş konu, konu başına "N kaynak" | ~105 sn; 10 ünite, 28 konu; her konu tek bir dosyanın sayfalarına bağlı |
| Word 6 sayfa | okundu | 19 Ekim'de 1 sayfa sayılıyordu → #376 ile 6 sayfa |
| Adımlar | ders, tarih, hedef, materyal, konular, çalışma biçimi ("Sen karar ver" dahil), odak, özet | aynı sıra; aşinalık kurulumda bir kez (Astra derste soruyor); "Sen karar ver" yok — boş seçim aynı anlama geliyor (17 Ekim kararı) |
| Hazırlığın kurulması | ilk dersleri kurulumda yazıyor | ~10 sn; ilk ders arka planda önceden yazılıyor |

## Plan

| | Astra | Cortex |
|---|---|---|
| Takvim | yol ilerledikçe kuruluyor (görünen: giriş dersi + 2 kilitli adım + "Sonraki ders") | sınava kadar her gün (24 gün), 94 etkinlik, günde 3–5; son gün zayıf nokta, odaklı pratik, yazılı deneme, kartlarla son tekrar, son kontrol |
| Sıra | konu listesinin sırası | öğrencinin onayladığı liste sırası (#377'den önce "sınavda ağırlıklı" konular öne alınıyordu) |
| Her konuda | ders, podcast, soru-cevap, test (sırayla açılıyor) | ders + en az bir test + tekrar; ağırlıklı konuda ek test (#377'den önce son 10 konu testsiz son güne yığılıyordu) |

## İlk ders

| | Astra | Cortex |
|---|---|---|
| Açılış | ~40 sn | 2,3 sn (önceden yazılmış); 19 Ekim'de 1,7 sn |
| Yapı | 7 adım; her adımda doğru/yanlış + kısa test | 7 adım; 4 kavram, 4 soru ("önce dene"), tablo, sınav vurgusu (turuncu), özet |
| Kaynak | "N kaynak": PDF 4 bölüm + Word + test fotoğrafı | yalnız kullanılan dosya ve sayfalar ("Homeostazi-Son-Tekrar-Notu.docx · s.1"); #378'den sonra yardımcı dosyalar "ek: parça 2" diye |
| Word'ün geri bildirim öğeleri (uyarı, reseptör, kontrol merkezi, efektör, cevap) | kullandı | kullandı (ilk ders bu sayfadan) |
| Kaynak dışı bilgi | etiketsiz ek bilgi vardı (enzimler) | yok; kaynak kuralı ve etiketli "Genel bilgi" notu |

## Dosyaların derse ulaşması

Kurs haritası her konuyu tek bir dosyaya bağlıyor. 19 Ekim'deki hazırlıkta nefron defteri, işaretli test
ve hipofiz kartı hiçbir konuya bağlanmadı; içerikleri hiçbir derse girmedi. #378 bunu modelsiz bir
eşleştiriciyle kapatıyor (`topic-support-pages.ts`):

| Dosya / parça | Gittiği konu |
|---|---|
| Nefron defteri (bütün) | Süzülme, Geri Emilim ve Salgılama |
| Hipofiz kartı (bütün) | hipofiz konusu |
| Test sorusu 2 (ADH, öğrenci yanlış) | ADH / idrarın hormonal kontrolü |
| Test sorusu 3 (glikoz geri emilimi) | Süzülme, Geri Emilim |
| Test sorusu 4 (soluk alma) | Solunum Yolları |
| Test sorusu 5 (kalpte ilk uyarı) | Kalbin yapısı / uyarı iletimi |
| Test sorusu 6 (CO₂ taşınması, öğrenci yanlış) | Gaz Değişimi, Kanda Taşınma |
| Word "12 sık hata" maddeleri | her biri kendi konusuna (refleks, sarkomer, miyopi, CO₂, glomerulus…) |
| İnce kaynaklı konu (tahta, EKG fotoğrafı) | PDF'in ilgili sayfası (s.6, s.44) ek kaynak olarak |

Ders yazarına ve denetçisine aynı not gider: test parçasında öğrencinin yanlış işaretlediği soru varsa
o nokta derste doğrusuyla ele alınır.

## İlerleme ekranı

İki üründe aynı alanlar: hazırlık puanı, hedef, kalan gün, hedefe ulaşan konu, ders sayısı, hazırlık
düzeyi / denemeler / tempo, sınav günü tahmini, bilgi eksikleri, konu listesi, haftalara göre konular.
"Beceri ağacı" bilerek yok (19 Ekim kararı).

## Bulunan ve kapatılan

| PR | Bulgu | Düzeltme |
|---|---|---|
| #376 | Word 1 sayfa sayılıyordu; konu haritası 4 kez yeniden kuruldu ve sihirbaz "konular yeniden düzenleniyor"da kaldı; gerçek bölümler (nefron, böbrek üstü, sarkomer) temellendirmede düştü | Word'ün sayfa işaretleri; kurs üyesi fotoğrafın boş haritası "bozuk" sayılmıyor; komşu sayfa ve kısa kök |
| #377 | Kurulum konuları sihirbazın haritasından değil eski birleştirmeden türetiyordu (9 konu sayfasız, yanlış sayfalar); yol listeden farklı sırada; yalnız hafta içi (25 gün → 18); son 10 konu testsiz son güne yığıldı; "N kaynak" 7 dosyayı da gösteriyordu; "PH" | kurulum haritayı okur ve sırasını korur; sorulmayan çalışma günü = her gün; iki geçişli takvim; kaynak penceresi konunun dosyaları; pH/mRNA/DNA korunur |
| #378 | Üç dosya hiçbir derse girmiyordu; iki konu tek fotoğraftan yazılacaktı | yardımcı kaynaklar (yukarıda) |
| #379 | Hiç açılmamış derste her açılışta ~5 sn "Kaldığın yer açılıyor… kaydedilmiş cevapların yükleniyor" | açık oturum sunucuda okunur; yoksa sorgu ve ekran atlanır |
| (bu PR) | Yeniden planlama (tarih, ayarlar, kaçırılan gün, uyarlamalı plan) konuları eski oturumlardan kuruyordu: dosya etiketi ve çok dersli konular kayboluyor, "zorlandığım" konu başa sıçrıyor, varsayılan yalnız hafta içi ve 45/60 dk tutarsız | tek yükleyici `loadPrepScheduleTopics`; ağırlık/zayıflık sırayı hiç değiştirmez; tek varsayılan (her gün, 45 dk); eski kurallar silindi |
| (bu PR) | 7 dosya sırayla işleniyordu (~76 sn); bekleyen belge kaydı tek kayıttı ve bir sekmenin temizliği öbürününkini siliyordu | ücretli hesapta 3 dosya aynı anda, seçim sırası korunur; kayıt belge başına |
| (bu PR) | Kurulumda konunun kaç dosyadan beslendiği görünmüyordu; tek konulu ünite konunun adını tekrar ediyordu | çok dosyalı konuda "N kaynak" (yardımcı dosyalar dahil); tekrar eden başlık yazılmaz |

## Açık kalan

- Kurs haritası bir konuyu tek dosyaya bağlıyor; çok dosyalı konu yardımcı kaynaklarla (#378) karşılanıyor,
  haritanın kendisinde değil. Ders, test, kart ve podcast hepsi yardımcı kaynakları okuyor; haritayı değiştirmek
  model istemini ve temellendirmeyi dosya dosya yeniden yazmayı gerektirir, ölçülmüş bir açık yok.
