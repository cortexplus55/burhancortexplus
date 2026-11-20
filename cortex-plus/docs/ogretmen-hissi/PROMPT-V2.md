# FAZ 13 · ÖĞRETMEN HİSSİ V2 — HİS ANLARI + ÖĞRENCİ DOSYASI + YÖNLENDİRİCİ
Bunu docs/ogretmen-hissi/PROMPT-V2.md olarak kaydet. Önceki 13B–13E-lite ve HIZLI OTONOM prompt bunun içinde ve bununla değiştirilmiştir. Çelişkide bu metin geçerli.

## 0. Yetki, sınır, bütçe
- Hepsi teacher.v2 bayrağı arkasında (+ alt bayrak teacher.v2.chatscan, varsayılan KAPALI). Bayrak kapalıyken davranış BİREBİR bugünküdür (regresyon testi şart).
- Yetki: CI yeşil + canlı duman testi sonrası bayraklı PR'ları BİRLEŞTİR. Global açma YOK. Migration UYGULAMA YOK (yaz, uygulama). Ödeme, kota, getGate/assertGate/useGate/UpgradeSheet, SOURCE_NUMBER_PRIORITY ve çift/örneklemeli denetim DOKUNULMAZ.
- Duraklar yalnız: (1) migration uygulaması, (2) Burhan'ın "SOHBET TARAMASINI AÇ" cümlesi, (3) global açılış "ÖĞRETMEN V2'Yİ AÇ".
- Hız bütçesi: seans açılışı ≤1 sn ve AI çağrısı YOK; Öğrenci Dosyası sorguları toplam ≤300 ms; her öğretmen turunda ilk metin ≤5 sn (medyan). Bu aşılırsa o PR'ı durdur ve geri al.
- Disk IO (canlı sorun): Dosya ve belge haritası sorguları indeksli ve LIMIT'li olmalı, sıralama/hash ile geçici dosya yazan sorgu YASAK. Her yeni sorgunun EXPLAIN çıktısını PR'a koy. Plan için match_document_chunks (vektör araması) ÇAĞIRMA; belge haritasını kullan. Akış sırasında parça başına veritabanı yazısı yok. Öğrenci Dosyası'nı seans başına bellekte/sunucu önbelleğinde 10 dk tut.
- Ücretsiz kullanıcının günlük 3 öğretmen mesajı gerçek: çoktan seçmeli cevap değerlendirmesi AI'sız (kural tabanlı, soruyla birlikte üretilmiş geri bildirim), AI yalnız açık uçlu cevapta, plan üretiminde ve kavram anlatımında. Açılış ve süre çipleri kota harcamaz.

## 1. Hedef his
Öğrenci hissetsin: "Beni tanıyan bir hoca önce bana bakıyor, ne yaptığımı görüyor, ne yapacağımızı söylüyor ve beni tek tek yürütüyor." Beş ilke: (1) Hoca önce konuşur. (2) Hoca önce bakar, sonra konuşur (analiz görünür ve gerçektir). (3) Her turda tek hamle. (4) Cevap en sona, soru en başa. (5) Hoca söylediğini yapar (söz = mekanizma).

## 2. Astra'da gözlenen davranışlar (yalnız davranış fikri; metin, görsel, ad KOPYALAMA)
Öğretmen sohbeti önce kendisi açıyor, tercih soruyor, "bunları hatırlayacağım" diyor ve ekranda "tercihlerin güncellendi" çipi çıkıyor; süreye bağlı plan veriyor; her turda tek soru + kaynak çipi; ders açılışında önce doğru/yanlış denemesi; yanlışta kısa, suçlamasız tepki + doğru bilgi + "başka biçimde tekrar soracağım" + yeni soru; denemeye küçük ödül; "düşünüyor N sn" ve "Adım 1/4" gibi süreç göstergeleri; ders hazırlanırken gerçek aşamalar listesi; ders = okuma bloğu + hemen aktif hatırlama; 6 seçenekli ruh hali seçici ("öğretmen buna göre uyum sağlayacak"); isim ve saate göre selamlama; seri ve günlük yıldız; hazırlık düzeyi ve hedef. Bunların Cortex'te zaten var olanları (ders içi ön soru, ruh hali seçici, Tekrarıma ekle 1/3/7/14, ikiz soru, Eğitmen paneli) yeniden yazma; sohbet ve yönlendirme katmanını onlara bağla.

## 3. ÖĞRENCİ DOSYASI (StudentDossier) — okuyup analiz eden katman
Sunucu tarafı, salt okunur, kullanıcının KENDİ verisi. Mevcut tabloları 13.0 denetimiyle doğrula; şunlardan okunur:
- Yanlışlarım kayıtları, Soru-Cevap / Konu Testi / Doğru-Yanlış sonuçları (konu etiketiyle), ikiz soru denemeleri
- Tekrar kuyruğu (bugün vadesi gelenler), DNA, seri ve yıldız
- Hazırlık planı: konu sırası, tamamlanma, GECİKEN gün (örn. −2), sınav tarihi
- Ruh hali geçmişi (çalışma geçmişine kaydedilenler)
- Yüklenen belgeler ve hazırlıklar (bölüm 4'teki belge haritası)
- Sohbet geçmişi: YALNIZ teacher.v2.chatscan açıksa, son 5 oturum; işlenir ama profil olarak SAKLANMAZ; çıkan "takıldığı kavram" yalnız bu seansın bağlamında kullanılır.
Çıktı: ≤300 token yapılandırılmış özet (en çok tekrar eden 3 zayıf kavram, geciken konular, vadesi gelen tekrarlar, son seans özeti, tercih edilen süre/stil, belge adı ve ağırlıklı bölümler). Her satır bir KAYNAK kaydına bağlıdır.
Şeffaflık: öğretmenin altında "Neye baktım" paneli; her satır ilgili kayda (Yanlışlarım vb.) bağlanır; kaydı oradan silmek bilgiyi siler (yeni tablo YOK). "Öğretmenin bildikleri" salt okunur görünüm.
Gizlilik: veri yalnız öğrencinin kendi seansı için kullanılır; reşit olmayanlarda yeni profil çıkarımı, sağlık/psikoloji çıkarımı, kişisel tanı YOK. Ruh hali yalnız ton için kullanılır, yorum yapılmaz. Misafirde dosya yok ("Bu seans için"). Aydınlatma metninde bu kullanımın yeri var mı kontrol et ve raporda Burhan'a not düş.
Dürüstlük: veri yoksa iddia yok. "Daha önce takılmıştın" cümlesi YALNIZ eşleşen kayıt varsa.

## 4. BELGE HARİTASI
Belge yüklendiğinde (veya ilk ihtiyaçta, arka planda, bir kez) hesapla ve belgenin mevcut kaydına (sütun/JSON) yaz: bölüm başlıkları + sayfa aralığı, tahmini ağırlık (uzunluk, tekrar eden terimler, çıkmış soru örtüşmesi), formül ve sayısal kural listesi (SOURCE_NUMBER_PRIORITY: notta g=10 gibi), belgedeki uzlaşımlar (işaret kuralı vb.). Şema değişikliği gerekiyorsa migration YAZ, UYGULAMA. Planlama yalnız bu haritadan okur; ağır arama yapmaz. Belge yükleme anında öğretmen tek cümleyle özetler (M14).

## 5. YÖNLENDİRİCİ (Director)
Niyet sınıfları (kural + hafif sınıflandırma, ek bloklayan model çağrısı yok): (1) belirsiz zorlanma ("bazı konularda zorlanıyorum") → Dosya analizi + plan; (2) belirli konu/kavram → kavram turu; (3) sınav yaklaşıyor ("yarın vizem var") → tarih ağırlıklı acil plan (en çok yanlış + Sınav Sabahı Kâğıdı); (4) soru çözdür / fotoğraf → el yazısı satır okuma akışı; (5) "çöz / cevabı söyle" → anında Doğrudan Çöz; (6) duygu ifadesi → önce 1 cümle, sonra tek küçük adım; (7) belge yükledi → belge analizi; (8) "ne yapmalıyım?" → tek öneri.
Öncelik skoru (deterministik, AI yok): vadesi gelmiş tekrar > ≥2 kez yanlış yapılan kavram > sınav tarihine göre ağırlıklı geciken konu > henüz dokunulmamış yüksek ağırlıklı belge bölümü > yeni konu. Seçilen süreye sığdır (10/20/45 dk). Her plan maddesi MEVCUT bir etkinliğe bağlanır (Konu anlatımı, Soru-Cevap, Kartlar, Bilgi boşlukları, ikiz soru, Video, Podcast). AI yalnız plan cümlesini ve ilk soruyu yazar (tek çağrı).
Öğretmen asla açık uçlu "ne istersin?" ile bırakmaz: her zaman veriye dayalı TEK öneri sunar, öğrenci değiştirebilir. Plan öğrenciyle konuşunca güncellenir. Plan şeridi ("Adım 2/3 · 12 dk kaldı") yalnız plan gerçekten o adımları izliyorsa görünür.

## 6. HİS ANLARI (her biri kabul testidir)
M1 Ana sayfa: isim + saate göre selamlama; bugünün tek önerisi ("Bugün için planım hazır · 20 dk") ve tek birincil "Başla"; gecikmiş konu tek satır; seri/yıldız küçük. AI yok.
M2 /ogretmen ve hazırlık sohbeti açılışı: öğretmen ilk konuşur: gerçek veriden 1–2 cümle (varsa gecikmiş/yaklaşan konu) + tek soru: "Bugün ne kadar vaktin var?" + çipler 10/20/45 dk + "kendi cümlenle yaz". Veri yoksa yalnız selam + süre. Kota harcamaz.
M3 Serbest cümle: niyet sınıflanır; öğretmen "Bir bakayım" der ve M4'e geçer.
M4 Analiz anı (şeffaf ve GERÇEK): en çok 3 çip, her biri gerçek bir sorguya bağlı ("Yanlışlarına baktı · N kayıt", "Belgeni taradı · {ad}", "Tekrar kuyruğuna baktı · N", "Sınav tarihine baktı"); toplam ≤2 sn; "Neye baktım" paneli. Hiçbir şey bulunmazsa dürüst söyle: "Seni daha tanımıyorum; 3 soruyla başlayalım."
M5 Teşhis (≤2 cümle, veriden): örn. "Baktım: son iki haftada işaret kuralında üç kez takılmışsın; Hücre Zarı da iki gün gecikmiş." Cümle sabit şablon olmasın, her seferinde veriye göre kurulsun.
M6 Plan: 2–4 madde, süre toplamı seçilen süreye eşit, tek öneri, çipler "Başlayalım" / "Değiştir". "Bunları hatırlayacağım" ve "Tercihlerin güncellendi" çipi YALNIZ gerçek bir yazma/kayıt olduysa.
M7 İlk soru ("önce dene"): açıklamadan ÖNCE tek soru, ayrı balon, kaynak çipi (sayfa). Çoktan seçmelide şıklar sohbet içinde tek dokunuş; "Bilmiyorum, ipucu ver" kısayolu cezasızdır.
M8 Cevap alınır: çoktan seçmeli değerlendirme AI'sız ve anında; açık uçlu cevapta AI.
M9 Yanlış cevap: (1) kısa kabul ("Güzel deneme"), (2) teşhis sorusu ("Nasıl düşündün?" / hatayı veriden tahmin et: "1/6'yı 1÷(2×3) diye mi buldun?"), (3) tek ipucu, (4) ikinci denemede doğru yol, (5) söz YALNIZ mekanizma gerçekse: yanlış tekrar kuyruğuna girer ve "Yarın sana tekrar soracağım · Geri al" çipi çıkar. Şablon motivasyon cümlesi, doğrulanamayan "en çok düşülen tuzak" iddiası, tüm şıkların açıklama duvarı YOK (diğer şıklar açılır bölümde).
M10 Doğru cevap: tek cümle onay + NEDEN doğru (1 cümle) + küçük zorlaştırma ("Şimdi bir tuzaklısı"). Çaba geri bildirimi hafif; yeni ödül ekonomisi yok, mevcut seri/yıldız kullanılır.
M11 Takılma (iki yanlış arka arkaya veya "bilmiyorum"): hoca stratejiyi DEĞİŞTİRİR ("Başka yoldan gidelim": benzetme/örnek/görsel); sinyal güçlüyse mola veya daha kolay soru önerir (tek cümle). Üçüncü yanlışta doğru yolu göster, tekrar kuyruğuna ekle, devam et.
M12 Anlatım: 1 mesaj = 1 fikir + 1 destek kutusu + 1 kontrol; kavram sorusunda ilk tur 45–60 kelime; "Anladım, devam" çipi sonra formül/tuzak kartlarını açar. Cevap SORUYLA AYNI mesajda verilmez ("Akılda kalsın" yalnız doğru cevaptan sonra veya seans sonunda).
M13 Etkinlik başlatma/dönüş: öğretmen "Şimdi 5 soruluk bir tur yapalım" der; "Başla" tek dokunuşla etkinlik formsuz açılır (zorluk DNA/yanlışlardan seçilir; ayarlar "Ayarla" altında). Etkinlik bitince sohbete döner: "3/5. İşaret kuralında bir hata; tekrar kuyruğuna ekledim." Plan şeridi ilerler.
M14 Belge yükleme: öğretmen belgeyi haritadan özetler ("12 sayfa, 4 bölüm, en ağırlıklı: …") ve sırayı önerir. Notta özel kural/sayı varsa görünür söyler ("Notunda g=10; sınavda onu kullanacağız"); kaynak çipli.
M15 Seans sonu: 3 satır özet (yaptığın, iyi gittiği, tekrar edeceğimiz), yarın için TEK öneri ("Yarın 10 dk: işaret kuralı"), seri/yıldız. Özet sohbet geçmişine "seans özeti" mesaj tipi olarak yazılır (mevcut tablo; şema gerekiyorsa migration YAZ, UYGULAMA) ve Öğrenci Dosyası'nı besler.
M16 Ertesi gün dönüş: özet ve tekrar kuyruğundan: "Dün işaret kuralında iki hata vardı; üç dakikayla başlayalım?" Yalnız kayıt varsa.
M17 Duygu ifadesi ("çok stresliyim", "yapamıyorum"): 1 cümle samimi karşılık (kopyalanmış kalıp değil), tek küçük adım; tanı veya yorum yok. Ciddi sıkıntı sinyalinde MEVCUT güvenlik akışı aynen çalışır.
M18 Boş/hata: veri yok, kota doldu (UpgradeSheet nazik), çevrimdışı, belge işlenmedi, misafir: hiçbirinde ölü uç yok; her birinde tek sonraki adım var ("Giriş yap" birincil).

## 7. SES KILAVUZU (tüm turlar için, kodla denetlenir)
"Sen" dili, kısa cümleler, sıcak ama abartısız, öğretmen ağzı. Yasak kalıplar (yakalanırsa kod siler/yeniden yazdırmadan düzeltir, ek model çağrısı yok): "Harika soru!", "Elbette!", "Tabii ki!", "Umarım yardımcı olmuştur", "Başka sorun var mı?", "Moral bozmak yok!", "Sana şunu söyleyebilirim ki", "Özetle," ile açılış, doğrulanamayan istatistik iddiaları. Mesaj başına en çok 1 emoji, soru cümlesinde yok. Sohbet turunda başlık ve madde işareti yok (yalnız plan). Tur kuralları: ≤90 kelime (kavram ilk turu 45–60), tek soru, tek destek kutusu, en çok 3 çip; soru ayrı balon. İç sistem dili ("hazırlık parçaları", "eşleşen bölüm") yok. Uzlaşıma bağlı konuda (işaret kuralı vb.) kaynak yoksa önce tek soru. Aynı soru aynı seansta bir daha sorulmaz.

## 8. EKRAN KURALLARI (Cortex tasarım sistemi, ui.v2 token'ları)
Tek odak: aktif soru varken diğer kartlar gizlenir. Etkinlik menüsü ve stüdyo araçları seans sırasında yalnız plan maddesi olarak görünür. Plan şeridi katlanabilir. Çip satırı en çok 3. Alt çubuk yer tutucusu bağlama göre ("Cevabını yaz"). Sakin satır aralığı ve boşluk. Telefonda klavye açıkken soru ve giriş alanı birlikte görünür (gerçek cihaz testi Burhan'da). "Cevabı göster" ve "çöz" her zaman erişilebilir; öğrenci hiçbir akışta tutsak edilmez.

## 9. DÜRÜSTLÜK
Süreç çipleri, "hatırlayacağım", "tekrar soracağım", plan şeridi ve "Neye baktım" yalnız GERÇEK bir sorgu/yazma/mekanizma varsa görünür. Uydurma süreklilik yok. SOURCE_NUMBER_PRIORITY ve "Genel bilgi" etiketi korunur. Astra'nın metin, görsel ve adlarını kopyalama; tüm metin özgün Türkçe.

## 10. PR SIRASI (hepsi teacher.v2, kapalı; önceki P0–P2 yapılmadıysa önce onlar)
PR-0 pilot düğmesini düello PR'ından ayır; Bulgu 1 (etiket); G-1 (ham işaret/altsimge taraması). → 13.0 denetimi #669'a ek: Öğrenci Dosyası için hangi tablolar var, hangi sorgu geçici dosya yazar, kanıtla.
PR-1 Ses kılavuzu doğrulayıcı + tur kuralları + süreklilik (aynı soru tekrarı yok) + Rehberli varsayılan + ipucu merdiveni.
PR-2 Öğrenci Dosyası (salt okunur) + "Neye baktım" paneli + birim testleri + EXPLAIN raporu.
PR-3 Belge haritası (arka plan, tek sefer).
PR-4 Yönlendirici (niyet, öncelik skoru, plan) + açılış akışı M1–M7.
PR-5 Etkinlik başlatma/dönüş ("Tek dokunuşla başla") + plan şeridi (M13).
PR-6 M8–M11 tepkileri + tekrar kuyruğu çipi + AI'sız çoktan seçmeli değerlendirme.
PR-7 Seans sonu özeti + ertesi gün dönüş (M15–M16) + belge yükleme anı (M14).
PR-8 Ruh hali bağlama, M17–M18 durumları, sakin ekran, misafir akışı.
PR-9 Değerlendirme (bölüm 11).
Sert durma: bayrak kapalıyken davranış değişirse, medyan ilk-metin >5 sn olursa veya yeni sorgu geçici dosya yazarsa o PR'ı durdur ve geri al.

## 11. DEĞERLENDİRME
Senaryolar: M1–M18'in her biri + S1–S15 (PROMPT.md) + S16 ("Başla" tek dokunuşla formsuz açılır) + S17 (belge yükle → özet ve sıra önerisi, notta özel sayı varsa görünür) + S18 (veri yok → dürüst "seni tanımıyorum" yolu). Her senaryo için ekran görüntüsü ve birebir metin.
Puan kartı (Burhan, aynı senaryoyu Astra'da ve Cortex v2'de 1–5 puanlar, kör sıralama): karşılama, tanınma, yönlendirme, tempo, sıcaklık, yanlışa tepki, süreklilik, sakin ekran, güven (kaynak), motivasyon. Hedef: her ölçütte Astra'ya eşit veya üstün. Eksik kalan ölçüt için ayrı iyileştirme listesi çıkar.
Metrikler: tur başına kelime/blok/soru, tekrar edilen soru (0), soru soran mesajda cevap sızıntısı (0), ilk-metin süresi, "Cevabı göster" tıklama oranı, seans tamamlama, ertesi gün dönüş, "Neye baktım" açılma oranı.

## 12. RAPOR
Her PR: ne değişti, bayrak, hangi M/S geçti-kaldı, ekran görüntüsü, EXPLAIN (yeni sorgularda), hız ölçümü. Sonda: Burhan için pilot açma adımları, "SOHBET TARAMASINI AÇ" için ne bekleniyor, kalan eksikler. Sırlar, .env, PayTR anahtarları rapora girmez.
