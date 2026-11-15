# FAZ 13 · ÖĞRETMEN HİSSİ (teacher.v2)

Bunu docs/ogretmen-hissi/PROMPT.md olarak kaydet. Önceki Faz 13 taslağını geçersiz say.

## 1. Neden
Burhan: "Cortex ChatGPT'ye sormuş gibi hissettiriyor; özel ders veren bir öğretmen hissi yok." Astra AI ve Cortex'i canlı, aynı senaryolarla karşılaştırdık. Sonuç: DERS ve HAZIRLIK tarafı (Önce dene, ruh hali seçici, plan, adım ilerlemesi, ikiz soru, Tekrarıma ekle) zaten Astra'ya yakın. "ChatGPT hissi" SOHBET katmanından geliyor: her tur bir şablon yığını, cevap önde, süreklilik yok, öğretmen konuşmayı başlatmıyor. Bu fazın işi yeni özellik eklemek değil, mevcut yetenekleri tek bir öğretmen sesi altında orkestre etmek. Aşağıdaki "zaten var" listesini YENİDEN YAPMA.

## 2. Zaten var (dokunma, yeniden yazma)
Ders: "Doğru mu yanlış mı?" ön sorusu (adım 2), ruh hali seçici (derse girerken, "çalışma geçmişine kaydedilir"), "Bu derste neler var" özeti, Adım N/M + süre, "Farklı anlat", yanlışta ipucu + "Dersin sonunda buna geri döneceğiz". Sohbet: "Problem N saniyede çözüldü" çipi, Sokratik'te "Bir ipucu daha ver / İlk adımı göster / Tam çözümü göster", "Eğitmen" paneli (Bilmiyorum sen anlat / İpucu / Örnekle), Tekrarıma ekle (1/3/7/14 gün), ikiz soru (+5 ⭐), "İki şık arasında kaldım", Yanlışlarım, DNA, 3 stil, el yazısı satır okuma, FormulaCard/ExamTrapCard/MemoryHookCard, hazırlık planı (~8 dk, +10 ⭐).

## 3. Canlı gözlem (13.0'da kendin yeniden üretip docs/ogretmen-hissi/baseline/ altına kaydet)
G1 /ogretmen'de misafir olmayan kullanıcı, varsayılan Doğrudan Çöz, "Üslü sayılarda negatif üssü hep karıştırıyorum. 2^-3 neden 1/8 oluyor?" → tek mesajda 155 kelime, 5 blok: ilk cümlede cevap, "Notundaki hazırlık parçalarında bu konuya eşleşen bölüm bulunamadı" cümlesi, Benzetme, Formül kartı, Sınav tuzağı, "2⁻² kaçtır?", Akılda kalsın + Tekrarıma ekle, 3 chip.
G2 Aynı konuşmada "Yani negatif üs sayıyı negatif yapıyor, 2^-3 = -8, değil mi?" → "Hayır." ile başlıyor ve G1'deki "2⁻² kaçtır?" sorusunu AYNEN tekrar soruyor, aynı Akılda kalsın kartını tekrar koyuyor (süreklilik yok).
G3 Sokratik mod, aynı soru → ~100 kelime, soruyla bitiyor AMA aynı mesajdaki "Akılda kalsın" kartı sonucu baştan söylüyor. Ardından "1/6 sanırım" (hata: 1÷(2×3)) → "Burada sonuç 1/8 olmalı." Cevabı hemen veriyor; teşhis doğru ama öğrenciye soru olarak sorulmuyor.
G4 Adım Adım, aynı soru → kavramsal soruda tüm adımlar tek mesajda, "Devam et" çıkmıyor; mesajda "TYT Kimya hazırlık notundaki eşleşen parçalarda bulunmadığı için" yazıyor ama seçili bağlam "Genel" (bağlam sızıntısı).
G5 /ogretmen açılışı: öğretmen konuşmuyor; sol rayda gecikmiş konular (−2 gün: Hücre Zarı ve Osmoz, Kuvvet-Hareket-Enerji) ve geri sayım var ama öğretmen dilinde sunulmuyor.
G6 Soru-Cevap, bilinçli yanlış şık → "Moral bozmak yok! Bu şık, sınavlarda en çok düşülen tuzaklardan. Gel, 10 saniyede mantığını kilitleyelim" + 4 yanlış şıkkın tamamının açıklaması + ikiz soru düğmesi. "En çok düşülen tuzak" iddiasının dayanağı yok.
G7 Hata: hazırlık sayfasında "Devam et" ilk tıklamada 404 (Sayfa bulunamadı); sayfa yeniden açılınca çalıştı, plan tarihleri 1 gün kaymış ve düğüm kimliği değişmişti. Hipotez: plan açılışta yeniden kuruluyor, eski düğüm siliniyor.
G8 Soru kalitesi: Enerjinin Korunumu S1'de C şıkkı bozuk dil bilgisiyle E'nin neredeyse aynısı.
Bunların hangisinin nedeni prompt, hangisi kod, hangisi veri: 13.0'da kanıtla.

## 4. Hedef davranış (teacher.v2 arkasında, sohbet katmanı)
A. Tek hamle: öğretmen turu ≤90 kelime (sert tavan 110), ≤1 soru, en fazla 1 destek kartı (Benzetme/Formül/Sınav tuzağı/Hafıza çivisi'nden biri). "Akılda kalsın" + "Tekrarıma ekle" SORU SORAN mesajda asla yer almaz; yalnızca öğrenci doğru cevap verdikten sonra veya mini-seans sonunda gelir. Chip'ler en fazla 3, bağlama özgü.
B. Süreklilik: seans durumu tut (sorulan sorular, öğrencinin son cevabı, tespit edilen hata kalıbı). Aynı soruyu aynı seansta tekrar sorma. Her tur öncekine bağlanır ("az önce 1/6 demiştin…").
C. Cevap ipucu merdiveninin sonunda gelir: önce soru/ipucu, öğrenci 2 deneme yapmadan veya "çöz/cevabı söyle" demeden cevap verme. Yanlış cevapta ÖNCE teşhisi soru olarak sor ("1/6'yı nasıl buldun? 2×3'e mi böldün?"), sonra düzelt. "İpucu ver" ve "Cevabı göster" her zaman görünür; "çöz" yazılınca anında Doğrudan Çöz'e geç (rehin tutma yok).
D. Varsayılan stil "Rehberli" (A–C kuralları). Üç pil ikincil "Nasıl anlatayım?" kontrolüne iner, Doğrudan Çöz bir dokunuş uzakta. Adım Adım: kavramsal soruda da gerçek adım modu (1. adım + "Devam et" çipi); şu an çıkmıyor, düzelt.
E. Öğretmen ilk konuşur: /ogretmen açıldığında (giriş yapmış kullanıcı) gerçek veriden kısa mesaj: gecikmiş/yaklaşan konu ve süre çipleri (10 / 20 / 45 dk). Örnek ses: "Hücre Zarı ve Osmoz 2 gün gecikti. Bugün kaç dakikan var?" Kural tabanlı: AI çağrısı yok, kota harcamaz. Süre seçilince 2–3 maddelik plan + ilk soru (1 AI çağrısı). Veri yoksa iddia yok. Hazırlık sayfasındaki "Sıradaki adım" kartı aynı öğretmen sesiyle ("Bugün için planım: …") yazılır.
F. Yanlış cevap tepkisi (sohbet ve Soru-Cevap): şablon motivasyon cümlesi ve doğrulanamayan istatistik iddiası ("en çok düşülen tuzak" vb.) YASAK. Kısa, suçlamasız, somut; doğru cevap + bu şıkkın neden cazip olduğu (1–2 cümle); diğer şıkların açıklamaları "Diğer şıklar" açılır bölümüne; ikiz soru birincil düğme. Söz yalnızca mekanizma gerçekse: yanlış cevap otomatik Yanlışlarım/tekrar kuyruğuna eklenir ve "Yarın sana tekrar soracağım · Geri al" çipi görünür. Mevcut mekanizmayı 13.0'da doğrula; yoksa söz verme.
G. Ruh hali: mevcut seçici ayrıca bağlanır: "Stresli/Düşük enerji" → bir sonraki öğretmen mesajı kısalır ve tek küçük adım olur; "Hazırım/Meraklı" → tempo artar. Önce 13.0'da mevcut seçimin öğretmeni gerçekten etkileyip etkilemediğini doğrula; etkilemiyorsa bağla ve seçici alt yazısını "Öğretmen buna göre uyum sağlayacak" yap (yalnızca gerçekten uyguluyorsa).
H. Öğrenci notu v1: Yanlışlarım, DNA, sınav tarihi, tercih edilen süre/stilden ≤300 token özet; görünür ve silinebilir "Öğretmenin notları". "Hatırlayacağım" cümlesi ve "Tercihlerin güncellendi" çipi yalnızca gerçek yazma olduysa. Uydurma süreklilik yok. Reşit olmayan kullanıcıda veri minimum (yalnızca çalışma tercihi ve konu zayıflığı), profilleme yok. Misafirde kalıcı not yok ("Bu seans için"). Yeni tablo gerekirse ADD-ONLY migration YAZ, UYGULAMA (preview ve canlı aynı DB); uygulamayı Burhan yapar.
I. Öğrenciye iç sistem dili yok: "hazırlık parçaları", "eşleşen bölüm bulunamadı" gibi cümleler "Bu konu notunda yok; ders kitabı bilgisiyle anlatıyorum (Genel bilgi)" biçimine döner (SOURCE_NUMBER_PRIORITY ve "Genel bilgi" etiketi korunur). "Genel" bağlamı seçiliyken hazırlık/ders adı geçemez (G4 sızıntısı).
J. Misafir hata kartı: "Giriş yap" birincil düğme; çalışmayan "Tekrar dene" tek başına ölü uçtur.

## 5. Bağımsız hata düzeltmeleri (bayrak yok, ayrı PR, MERGE ETME, Burhan onayı bekle)
H1 Hazırlık sayfası "Devam et" 404: CTA tıklama anında güncel sıradaki adımı çözsün; düğüm yoksa 404 yerine güncel "Sıradaki adım"a yönlendir. Plan yeniden kurulumunun gerçekten bu 404'ü üretip üretmediğini kanıtla.
H2 Soru kalitesi: çoktan seçmelide şıkların birbirinden ayrılabilirliği ve dil bilgisi doğrulaması (C/E örneği). İçerik üretim hattına dokunur: önce bulguyu ve önerini raporla, DURAK D2.

## 6. Dokunulmazlar
Ödeme/PayTR, getGate/assertGate/useGate/UpgradeSheet, kota ve fiyatlar, SOURCE_NUMBER_PRIORITY ve çift denetçi, 5/4 şık kuralları, ui.v2.* bayrakları, pay/duello/duel.enabled/paylas durumu, mevcut ders/hazırlık yetenekleri (Bölüm 2). Astra'nın metinlerini, görsellerini, adlarını kopyalama; yalnızca davranış fikri, tüm metin özgün Türkçe ve Cortex sesiyle.

## 7. PR sırası (hepsi teacher.v2 sunucu bayrağı arkasında, varsayılan KAPALI)
13.0 DENETİM (kod değişmez): Bölüm 3'teki G1–G8'i giriş yapmış test hesabıyla kendin yeniden üret, birebir metin ve ekran görüntüsünü docs/ogretmen-hissi/baseline/ altına kaydet; mevcut öğretmen sistem istemini ve cevap şablonlayıcıyı oku; her gözlem için "neden: istem / kod / veri" yaz; Bölüm 4'teki G ve F maddeleri için mevcut mekanizmaları (ruh hali etkisi, Yanlışlarım otomatik kayıt) doğrula. Rapor: docs/ogretmen-hissi/denetim.md → DURAK D1.
13A Tek hamle kuralı + blok/chip tavanı + A ve I (şablon birleştirici).
13B Seans durumu ve süreklilik + ipucu merdiveni + yanlış cevapta soru olarak teşhis + Rehberli varsayılan + gerçek adım modu (B, C, D).
13C Öğretmen ilk konuşur + süre çipleri + plan + hazırlık "Sıradaki adım" kartı sesi (E, J).
13D Yanlış cevap tepkisi + otomatik tekrar kuyruğu çipi (F) + ruh hali bağlama (G).
13E Öğrenci notu v1 + "Öğretmenin notları" (H). Migration yazılır, uygulanmaz → DURAK D4.
13F Değerlendirme: Bölüm 8 senaryolarının tamamı + metrikler + Burhan için yan yana karşılaştırma dosyası (v1 / v2 / Astra, aynı senaryo).
Hata düzeltmeleri (Bölüm 5) bu sıradan bağımsız ayrı PR'lar olarak açılır.

## 8. Kabul senaryoları (bayrak AÇIK, Burhan hesabı; her biri için ekran görüntüsü + birebir metin kaydet)
S1 G1 sorusu → ≤90 kelime, ≤1 soru, 1 destek kartı, "Akılda kalsın" aynı mesajda YOK.
S2 G2 takibi → önceki soru tekrar edilmez, öncekine bağlanır ("az önce … demiştin").
S3 "1/6 sanırım" → önce "nasıl buldun?" tipi teşhis sorusu, cevap hemen verilmez; ikinci yanlışta doğru yol.
S4 Adım Adım, kavramsal soru → yalnızca 1. adım + "Devam et".
S5 "çöz" / "cevabı söyle" → anında doğrudan çözüm.
S6 /ogretmen'i yazmadan aç → öğretmen gecikmiş/yaklaşan konudan konuşur, süre çipleri var, AI çağrısı ve kota harcaması yok.
S7 Ruh hali "Stresli" → sonraki öğretmen mesajı belirgin kısalır, tek küçük adım.
S8 Soru-Cevap yanlış şık → şablon motivasyon cümlesi ve doğrulanamayan iddia yok; diğer şıklar açılır bölümde; ikiz soru birincil.
S9 Yanlış cevap sonrası → tekrar kuyruğuna eklendi çipi ve "Geri al" gerçekten çalışır; mekanizma yoksa söz de yok.
S10 "Genel" bağlamda hazırlık/ders adı geçmez; "hazırlık parçaları" dili yok.
S11 Misafir → "Giriş yap" birincil düğme.
S12 Bayrak KAPALI → bugünkü davranışla birebir aynı (regresyon).
S13 "Öğretmenin notları" görünür ve tek tek silinebilir; silinen bilgi bir daha söylenmez.
S14 Ücretsiz kullanıcıda açılış ve süre çipleri kotayı harcamaz.

## 9. Metrikler (anonim sayaç, kişisel içerik yok)
Tur başına kelime, tur başına blok sayısı, tur başına soru (hedef 1), tekrar edilen soru oranı (hedef 0), soru soran mesajda "Akılda kalsın" oranı (hedef 0), ilk turda doğrudan cevap oranı (düşmeli), "Cevabı göster" tıklama oranı (aşırı yüksekse öğretmen fazla yavaş), seans süresi, ertesi gün dönüş.

## 10. Yayın kuralı
teacher.v2 yalnızca Burhan'ın hesabında açılır (sunucu bayrağı, kill-switch ≤30 sn). Global açılış yalnızca Burhan "ÖĞRETMEN V2'Yİ AÇ" yazarsa.

## 11. Duraklar
D1: 13.0 denetim raporu, onay bekle. D2: soru kalitesi (H2) bulgusu ve önerisi, onay bekle. D4: migration yazıldı, Burhan uygular. D5: global açılıştan önce 13F raporu, "ÖĞRETMEN V2'Yİ AÇ" bekle. Duraklar dışında sormadan ilerle.

## 12. Rapor
Her PR için: ne değişti, hangi bayrak, hangi senaryo geçti/kaldı, ekran görüntüsü. Sırlar, .env, PayTR anahtarları rapora girmez.
