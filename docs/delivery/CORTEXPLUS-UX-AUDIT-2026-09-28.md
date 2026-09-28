# Cortex Plus öğrenci deneyimi denetimi — 28 Eylül 2026

## 1. Executive Summary

**Karar:** Belgeden çalışma altyapısı artık 99 sayfalık bir metin PDF'ini okuyup 11 ayrı konuya ve fiziksel sayfa aralıklarına bağlayabiliyor. En büyük açık, ilk yararlı sonuca giderken öğrencinin güvenidir: tanışma testinde bir üretim hatası görüldü; onarımdan sonraki canlı testte 3 sorunun ikisi sağlam, üçüncüsü kavramsal olarak belirsizdi. Akış çalışıyor demek, soru kalitesinin istikrarlı olduğu anlamına gelmiyor. İkinci açık, etkin plan ile tüm geçmiş çalışmaların ilerleme ve zayıflık verilerinin aynı ekranda bağlam belirtilmeden sunulmasıdır.

**Ek canlı bulgu, aynı gün:** İlk konunun tanışma testi bitirilmeden “Birim Çember”e geçildiğinde ikinci konu ekranı ilk konunun etkin soru girişimini yeniden kullandı ve “Bir tam tur kaç derece?” sorusunu gösterdi. Kök neden, etkin `exam_prep_intro_attempts` sorgusunun yalnızca hazırlığa bakıp `topic_id` ile sınırlandırılmamasıydı. Başlatma ve tamamlama sorguları seçili konuya, tamamlama ayrıca gösterilen `attemptId` değerine bağlandı. Bu düzeltmenin kalıcı kabul ölçütü, iki konu arasında geçişte her zaman konuya ait ayrı soruların ve ayrı yanıtların korunmasıdır.

Bu rapor 99 sayfalık **sentetik** trigonometri PDF'i ve oturum açılmış öğrenci/kurucu hesabıyla canlı Cortex Plus ve Astra gezintisine, ayrıca Cortex Plus koduna dayanır. Sentetik belgenin bölüm başına içeriği seyrektir; gerçek ders materyali kalitesine genelleme yapılmaz. Farklı telefon genişlikleri, sıfırdan kayıt, abonelik ödemesi ve tüm 39 plan etkinliği canlıda uçtan uca sınanmadı. Bunlar başarı olarak yazılmıyor. Astra, öğrenciye sağladığı öğretim ve yön bulma faydası için referanstır; piksel kopyası hedef değildir.

Kanıt bağlantıları: [Cortex plan](https://cortexplus.app/deneme-sinavlari/4b9ee90c-3f1b-4032-b919-1b3506dd8f26), [Cortex 99 sayfalık belge](https://cortexplus.app/dokumanlar/7a871ff2-7221-4679-a6ba-2f2e3abe5185), [Astra sınav hazırlıkları](https://app.astra-ai.co/exam-preps). Bağlantılar oturum gerektirir. Canlı testten önceki soru açıklamalarında `2π` için 90°, `π/2` için tam dönüş yazılmıştı. Sonraki sürümde bu iki eşleme düzeldi; yeni üçüncü sorudaki belirsizlik bu denetim sırasında ayrıca kapıya eklendi.

## 2. Cortex Plus'ın en kritik UX sorunları

| Öncelik | Kanıt → öğrenci etkisi | Somut çözüm ve bitiş ölçütü |
|---|---|---|
| P0 | İlk dersin tanışma testi `invalid_ai_response` ile açılamadı; öğrenci daha ilk adımda bekleyip yeniden denedi. | Taslak üretimi/bağımsız denetim aynı kredi işlemi içinde yeniden denensin; hata metni ve derse geçiş kalsın. 30 farklı belge-konuda 30/30 ilk denemede kullanılabilir test ve reddedilen üretimde 0 kredi kaybı. |
| P0 | Canlı soru “Bir açının ölçüsünü radyanda ifade etmek için hangi değer kullanılır?” diyerek `π`yi tek yanıt saydı. Radyan birimdir, herhangi bir açı tek başına π olmak zorunda değildir. | Belirsiz soru kökünü üretimden çıkar; ölçülen kavram, koşul ve tek doğru yanıt denetimini her derse uygula. Üretim sonrası örneklemde 0 tartışmalı doğru anahtar. |
| P0 | Bitmemiş Açı Ölçüsü testi varken Birim Çember seçildiğinde aynı etkin girişim ikinci konuya taşındı. | Etkin girişim sorgusu `topic_id` ile, bitirme işlemi ayrıca istemcinin gördüğü girişim kimliğiyle sınırlandırılsın. İki konu arasında geçişte yanlış konunun sorusu/puanı 0. |
| P1 | Ana sayfadaki aktif trigonometri planının yanında fizik ve fonksiyon gibi eski zayıf konular görünüyordu. Bu, planın konuları karıştırdığı izlenimini veriyor. | Listeyi “Tüm çalışmalarından” diye etiketle (bu tur yapıldı); sonra etkin planın zayıflıklarını ayrı veri sorgusuyla göster. Plan panelinde yabancı konu 0. |
| P1 | Planın 39 etkinliği uzun bir listede; ilk dersten sonraki karar, ileri etkinliklerin ağırlığında kayboluyor. | “Şimdi”, “Bugün”, “Sonra” katmanları; sonraki 1 eylem ve bağlı kaynak önde, kalan gruplar kapalı. İlk anlamlı CTA ilk görünümde. |
| P1 | 3/3 tanışma sonucundan sonra ilerleme bölümünde “ölçülen konularda zayıf sinyal” ve %0 hâkimiyet görüldü. Tanı puanı ile hâkimiyet farklı olabilir fakat metin bunu anlatmıyor. | “Tanı puanı 3/3; hâkimiyet henüz bağımsız pratikle ölçülmedi” gibi iki ayrı satır; puanların hesap yöntemi açıklanmalı. |

## 3. Cortex Plus'ın en kritik UI sorunları

- **Hiyerarşi:** Dashboard'da mavi “Çalışmaya Başla” açık ana aksiyon; fakat bugünkü görevler, küresel zayıf konular, son belgeler ve ilerleme aynı dikey akışta etkin hazırlık bağlamını dağıtıyor. CTA altında tek cümle neden ve sonraki konu/sayfa aralığı gösterilmeli.
- **İç terimler:** Belge detayında kapsam `complete`, harita `ready` ve “Aşama 3+ üretimde kullanılacak” yazıyordu. İlk ikisi öğrenci diline çevrildi; üçüncüsü ürün içi yol haritasını öğrenciye taşıyor. Gerçek kullanım koşulunu kısa ve bugün geçerli metinle anlatmalı.
- **Okuma yoğunluğu:** Planın 39 düğümünde her satırda başlık, kaynak, sayfa, süre, sıra var. Bölüm başına yalnızca sıradaki 1–2 etkinlik varsayılan açık olmalı; “tüm yolu gör” isteğe bağlı.
- **Ders bitişi:** Seyrek sentetik kaynakta son adım boş “Özet” başlığı taşıyordu; bu başlık kaldırıldı. Başka derslerde son adım gerçekten kazanılan kavramları 2–3 maddeyle özetlemeli.
- **Tutarlılık:** `--c-*` token sistemi var ama birçok ekranda `--cs-*` köprüsü ve ayrı kart düzenleri kullanılıyor. Yeni görsel sistem baştan yazılmadan ortak bileşen varyantları birleştirilmeli.

## 4. Astra'nın daha başarılı olduğu noktalar

- Giriş görünümü tek ana “BAŞLA” ve kısa sohbet alanıyla sakin bir ilk odak sunuyor. Cortex daha çok eylemi hemen gösterdiğinden keşif güçlü, fakat yeni öğrencide ilk karar yükü yüksek.
- Hazırlık ekranında tek bir “Devam et” ana aksiyonu ve görsel yol, sıradaki işi bulmayı kolaylaştırıyor. Cortex'in sayfa atıflı ayrıntısı daha güçlü; görünür ilk katmanda Astra'nın odak disiplininden yararlanılmalı.
- Astra'nın ilerleme ekranı konu bazında düzey, geçmiş ve tekrar türlerini aynı hazırlığa bağlı gösteriyor. Cortex'te tanı sonucu/hâkimiyet ayrımı daha açık olmalı.

## 5. Cortex Plus'ın daha başarılı olduğu noktalar

- 99 sayfalık belgede 99/99 fiziksel sayfa kapsamı, 11 ayrı konu ve s.1–9 … s.91–99 kaynak eşlemesi görüldü. Bu doğrulanabilirlik Astra'nın canlı karşılaştırmada daha görsel fakat daha az kaynak ayrıntılı görünen yolundan güçlü.
- Yükleme ekranı PDF 50 MB/diğerleri 15 MB sınırı, desteklenen biçimler ve taranmış PDF kotasını açıkça gösteriyor. Önceden yüklenen belgeyi yeniden kullanmak mümkün.
- Belgeye bağlı “Yalnızca bu belge” ve destekleyici bilgi tercihi var; öğrenciye kaynak sınırı hakkında karar yüzeyi sağlıyor. Bu modların cevap doğruluğu ayrı kapsamlı test ister.
- İlerleme sayfası ekran süresini ölçmediğini açıkça söylüyor; uydurma çalışma süresi yerine etkinlik sayısı kullanıyor.
- Astra'nın görülen konu başlıklarında da yazım/anlam sapmaları vardı; yarış yalnızca görsel taklitle kazanılmaz.

## 6. Eksik veya henüz kanıtlanmamış özellikler

Bu bölüm “yok” iddiası değildir. Canlıda henüz doğrulanmayan veya görülen akışta eksik kalan işlerdir: tüm derslerde soru anahtarı ve çeldirici gerekçesi örneklem kalite denetimi; 390/768/1024/1280/1440 px gerçek cihaz görünümü; ekran okuyucu ve yalnız klavyeyle tam akış; taranmış/şifreli/bozuk PDF için hata ve yeniden deneme; tüm konu etkinliklerinde bağlam devamı; yeni ücretsiz hesapta ilk yükleme ve kredi; abonelik akışı. Bunların her biri kabul testiyle doğrulanmalı.

## 7. Gereksiz veya geri getirilmeyecek özellikler

Eski öğretmen/veli panelleri ve 34 simülasyonlu eski “Uygulamalar” alanı ürün kararıyla emekli edilmiştir; Astra'da bir benzeri göründü diye geri getirilmemeli. Plan sayfasında 39 düğümün ilk açılışta tamamının gösterilmesi de gerekli değildir; veri dururken varsayılan görünüm sadeleşebilir.

## 8. Yeniden tasarlanması gereken özellikler

1. **Dashboard:** etkin hazırlık, bugün, küresel tekrar ve son belgeler ayrı bağlam başlıklarına ayrılmalı.
2. **Sınav planı:** 39 düğüm katlanabilir haftalar ve “şimdiki adım” ile sunulmalı; sayfa aralığı korunmalı.
3. **Tanışma testi:** üretim süresi, soru kaynağı, “geç/yeniden dene” ve gerçek kavramsal açıklama birlikte tasarlanmalı.
4. **Ders sonu:** öğrenilenler, yanlışlar, sıradaki pratik tek ilerleme ekranında birleşmeli.
5. **Belge detayı:** kaynak sınırı ile teknik durum ayrılmalı; öğrenci “hazır / inceleniyor / müdahale gerekli”yi görmeli.

## 9. Quick Wins

- Yapıldı: dashboard küresel tekrar listesi açıkça etiketlendi; `complete/ready` teknik durumları öğrenci diline çevrildi.
- Yapıldı: ilk test için üç taslak denemesi, bağımsız seçenek gerekçesi denetimi, hatalı açı eşlemesi filtresi; bu tur ayrıca belirsiz radyan sorusuna ret eklendi.
- Sonraki küçük iş: etkin planın zayıf konuları ile diğer çalışmaların tekrarlarını veri düzeyinde ayır.
- Sonraki küçük iş: 3/3 tanı, %0 hâkimiyet ve “zayıf sinyal” dilini tek açıklamaya bağla.
- Sonraki küçük iş: belge detayındaki “Aşama 3+” metnini bugünkü gerçek davranışa göre yeniden yaz.

## 10. P0 problemleri

Öğrencinin ilk derse ulaşamaması, hatalı/çok anlamlı soru veya yanlış kaynak bilgisi P0'dır. Aşağıdaki ilk iki satır bitmeden genel “sorunsuz” beyanı yapılmamalı.

## 11. P1 problemleri

Plan kapsamı, ekran yoğunluğu, mobil/erişilebilirlik ve hata durumları öğrenme akışını etkiler; sonraki dört satır bu gruptadır.

## 12. P2 problemleri

Görsel bileşenlerin tekilleştirilmesi son satırdır. Öncelik tablosu:

| İş | Öncelik | Efor | Etki | Kabul kriteri |
|---|---|---|---|---|
| 30 belge/konu tanışma testi kalite örneklemi, belirsiz/yanlış soru ret oranı | P0 | M | Kritik | 30/30 test açılır; bağımsız öğretmen incelemesinde yanlış anahtar 0 |
| Tanışma girişimi konu ve girişim kimliğine göre ayrıştırma | P0 | S | Kritik | A→B→A geçişinde iki testin soru ve cevapları karışmaz |
| Ders içi kontrol, quiz, doğru/yanlış, podcast için kaynak ve doğruluk örneklemi | P0 | L | Kritik | Her formatta 20 örnek; yanlış matematik ve uydurma kaynak 0 |
| Aktif hazırlığa bağlı ilerleme ve tekrar ayrımı | P1 | M | Yüksek | Diğer ders başlığı aktif plan kartında 0 |
| Plan yoğunluğunu “Şimdi/Bugün/Sonra”ya bölme | P1 | M | Yüksek | İlk CTA kaydırmasız, sayfa atfı korunur |
| 390–1440 px + klavye/ekran okuyucu geçişleri | P1 | M | Yüksek | Yatay taşma 0; temel akış klavyeyle tamamlanır |
| Boş, yavaş, başarısız PDF ve sınav üretimi metinleri | P1 | S | Yüksek | Her durumda neden + sonraki eylem |
| İkon/boşluk/kart tekilleştirme | P2 | M | Orta | Ekran başına bir ana CTA; token dışı renk azalışı |

## 13. Tasarım sistemi önerisi

Mevcut `cortex-plus/src/styles/tokens.css` **tek kaynak** olarak korunmalı. Figtree arayüz yazısı, DM Serif Display seçici büyük başlıklar, `--c-bg`, `--c-surface-1..3`, `--c-action` (eylem mavisi), `--c-brand` (marka sarısı), `--c-success/warning/danger`, `--c-focus` mevcut. `--cs-*` gibi köprüler kaldırılmadan yeni bileşenler doğrudan `--c-*` kullansın. 4/8/12/16/24/32/48/64 px aralık; 8/12/16/20/24 px köşe; 12/14/16/18/22/28/36 px yazı ölçeği yeterli. Sayfa içeriği okuma için 672–760 px, analitik tablo/iki sütun için 1040–1200 px. Bu ölçüler uygulama önerisidir, mevcut ekranlarda tamamı doğrulanmış standart değildir.

**Bileşen sözleşmesi:** `Button` primary/secondary/quiet/destructive, en az 44 px dokunma alanı; `Input` etiket + yardım + hata + odak; `Card` tek başlık, tek metadata satırı, en fazla bir primary eylem; `Tabs` seçili durumu renk + çizgi + ARIA; `StatusBadge` anlamlı Türkçe metin; `Progress` hem yüzde hem ölçüm kapsamı; `Toast` kısa durum, kalıcı hata için sayfa içi uyarı; `EmptyState` başlık + neden + ilk eylem; `Skeleton` yalnızca beklenen gerçek içeriğin yaklaşık düzeni. Modal mobilde sayfa altından açılır ve odak kapanana kadar içinde kalır. Hareket için mevcut reduced-motion desteği korunur.

Renk/kontrast ve mobil uygulama denetimi bir kabul testidir; salt token varlığı WCAG uyumu kanıtlamaz. `--c-text-subtle` gibi açık gri metnin koyu yüzeydeki kontrastı ölçülmeli. Hata yalnız kırmızı, başarı yalnız yeşil ile anlatılmamalı.

## 14. Ekran ekran karşılaştırma ve yeni yazılı wireframe

Her satır “amaç → ilk görünüm → sonraki eylem” sırasını tanımlar. “Astra” hücresindeki boşluk canlıda değerlendirilmedi demektir; yokluk iddiası değildir. Tüm ekranlar için ortak durum: boşsa açıklama ve CTA, yükleniyorsa aşama/süre hissi, hata varsa neden ve güvenli tekrar; mobilde tek sütun ve alt eylem erişilebilir kalır.

| Ekran | Astra gözlemi / Cortex kanıtı | Fark, yeni yerleşim ve bileşen | Öncelik / efor |
|---|---|---|---|
| Login | Canlı oturum açık olduğundan iki giriş formu doğrulanmadı. | Ortada tek form: logo, “Çalışmana devam et”, e-posta/şifre, giriş, sıfırlama; hatada alan üstü uyarı ve yeniden deneme. Mobilde tam genişlik. | P1 / S |
| Onboarding | Astra ve Cortex'in yeni hazırlık sihirbazları gözlendi; yeni hesap onboarding'i görülmedi. | Sınav/hedef/tarih/günlük süre dört kısa adım; kalıcı geri dönüş; “belgem var” sonraki yüklemeye gider. Adım göstergesi ve kayıt durumu. | P1 / M |
| Dashboard | Astra ana ekran tek başlangıç odağı; Cortex CTA + görev + global zayıflık gösteriyor. | Üstte etkin hazırlık, “şimdi 18 dk · s.1–9” CTA; sonra bugün, en altta “diğer çalışmalar”. Global veri açık etiketli. | P1 / M |
| Library / Belgeler | Cortex belge listesi ve 99 sayfalık detay görüldü; Astra belge kitaplığı incelenmedi. | Arama + filtre; belge kartında ad, sayfa, okunma durumu, son çalışma, “Devam”; boş durumda “İlk belgemi yükle”. | P1 / M |
| PDF Upload | Astra sürükle/bırak ve telefon seçeneği; Cortex biçim/limit/kota ve eski belgeyi seçme gösteriyor. | Tek damla alanı, “Bilgisayardan/telefondan”, limitler altında, yükleme %, işleme aşamaları, hata/tekrar; bitince “Konuları incele”. | P0 / M |
| Document Detail | Cortex 99/99 kapsam, 11 konu, PDF önizleme, sayfa aralığı ve kaynak modu sunuyor. | Üstte belge hazır + tek CTA; yan/alt alanda PDF ve konu haritası; teknik durumlar Türkçe; kaynak modunun güncel davranışı açık. | P1 / M |
| AI Chat | Cortex genel/yalnız belge/karma kaynak modu canlı görüldü; cevap kalitesi bu tur sınanmadı. | Başlıkta etkin kaynak, mesaj altında belge sayfası veya “Genel bilgi” etiketi; boş durumda örnek soru; hata/yeniden dene; mobil klavye üstü giriş. | P1 / M |
| Summary | Canlı özet üretimi bu tur sınanmadı. | Belge/konu seçimi, kaynaklı 5–7 ana fikir, bilinmeyenleri işaretle, “Bu özetten test”; boş/hata/üretim durumları. | P1 / M |
| Notes | Canlı not oluşturma sınanmadı. | Konuya bağlı not listesi, otomatik kayıt göstergesi, “Not ekle”; boş ve çevrimdışı hata durumu. | P2 / M |
| Flashcards | Plan düğümü görüldü; oturum uçtan uca sınanmadı. | Ön yüzde tek kavram, arkada yanıt + sayfa; “Biliyorum/Tekrar et”, oturum sonunda ölçülebilir sonuç. | P1 / M |
| Quiz | Üç soruluk tanı canlı tamamlanmaya yakın sınandı; üçüncü soru kavramsal belirsizdi. | Soru, seçenek, tek kontrol eylemi, şık bazlı açıklama, kaynak, sonra sonraki soru; hata durumunda aynı krediyle güvenli tekrar. | P0 / M |
| Study Session | Cortex plan 39 etkinlik ve ilk dersin 5 adımı görüldü; Astra tek “Devam et” odağı güçlü. | Üstte konu + kaynak, ortada yalnız mevcut ders adımı, altta kontrol/sonraki eylem; uzun yol ayrı açılır. | P1 / L |
| History | Cortex `/ilerleme` etkinlik ve streak, Astra aktiviteler grafik/ısı haritası gösteriyor. | Hazırlığa göre filtre, gerçek etkinlik sayısı, tanı/bağımsız pratik ayrı; eski çalışmalar ayrı sekme. | P1 / M |
| Settings | Cortex ayarlar bağlantısı görüldü; değiştirme/silme akışı sınanmadı. | Profil, öğrenme tercihleri, gizlilik/veri, bildirimler ayrı gruplar; kaydedildi/hata durumu; kritik silmede iki aşama. | P1 / M |
| Subscription | Canlı ödeme yapılmadı. | Plan/kalan hak/dönem bitişi tek özet; ücret ve yenileme gerçeği açık; plan değiştirme için bir CTA, işlem sonucunda sunucu durumu. | P0 / M |

**Bilgi mimarisi:** Cortex alt gezinmesi Ana Sayfa → Çalış → AI → Belgeler → Profil; plan içi Çalışma yolu/Konular/Materyaller/İlerleme; sohbet, yanlışlar ve ek araçlar plan bağlamına bağlı. Astra üstünde Sor/Sınavlar/Uygulamalar; sınav hazırlığı altında yol/ilerleme. Cortex'te bir sonraki işi bulmak mümkün, ancak belge detayındaki “Çalışmaya devam et”, plan içindeki “Hadi öğrenmeye başlayalım” ve dashboard ana CTA farklı kapılardan aynı çalışmaya götürebiliyor. Bağlama göre **bir** ana yol gösterilmeli. Arama/bildirimlerin tüm menülerdeki yerleşimi bu tur doğrulanmadı.

**Micro UX / boş durum / güven:** Yüklemede “belge okunuyor → metin çıkarılıyor → konular kuruluyor → hazır” gibi doğrulanabilir aşamalar; yavaş işte son güncelleme ve güvenli tekrar; tanıda “yeniden dene / beklemeden derse geç”; yanlış yanıtta doğru şıkkın nedenini ve yanlış şıkkın kendisine özgü gerekçeyi göster. İlk başarı anı “1 konu ölçüldü, sırada s.10–18” olmalı. Kaynak atfı gerçek PDF sayfasını açmalı; AI'ın genel bilgisi kaynağa mal edilmemeli. Kalıcı sonuçlarda neyin ölçülmediği dürüstçe yazılmalı.

**Responsive ve erişilebilirlik doğrulama sınırı:** Chrome uzantısında viewport değişikliği sayfa genişliğini fiilen değiştirmedi; 390/768/1024/1280/1440 px için canlı hüküm verilemez. Ayrı cihaz/otomasyon matrisi ile navigasyon, modal, PDF önizleme, klavye açıldığında sohbet girişi, quiz seçenekleri ve 44 px hedefleri sınanacak. Bu raporda WCAG sertifikası iddiası yoktur.

## 15. İlk 30 gün

1. Tanı, ders kontrolü ve quiz üretimlerini 5 ders × 6 konu × iki zorluk matrisinde örnekle; insan incelemesinde yanlış anahtar/uydurma kaynak sıfır olmadan güven beyanı yapma.
2. Dashboard ve hazırlık ilerlemesini plan kapsamına ayır; tanı puanı ile hâkimiyet açıklamasını düzelt.
3. Belge yükleme/işleme için gerçek 20, 99 ve 200+ sayfa; taranmış, bozuk ve şifreli PDF kabul testleri oluştur. Sayfa sayısı için “sınırsız” vaadi verme; dosya boyutu, OCR kotası ve işlem süresi fiili sınırları şeffaf göster.
4. 390/768/1024/1280/1440 px görsel ve klavye matrisi uygula; başarısız ekranları düzelt.

## 16. 60 gün

1. Planı “Şimdi/Bugün/Sonra” katmanına dönüştür; kaynak sayfaları ve 39 etkinliğin tam listesi isteğe bağlı kalsın.
2. Her konu için ders → kısa kontrol → yanlış gerekçesi → benzer soru → tekrar döngüsünü, sayfa kaynağıyla ve bağımsız başarı sinyaliyle doğrula.
3. Podcast, flashcard, özet ve sohbet için ortak kaynak/kapsam sözleşmesi ve otomatik örneklem kalite raporu oluştur.

## 17. 90 gün

1. Yeni ücretsiz ve ücretli öğrenci kohortlarında kayıt → belge hazır → ilk yararlı çıktı dönüşümünü ölç; gerçek hesaplarla bilgi izolasyonu ve kredi hatalarını izle.
2. İçerik doğruluğu, ilk test açılma oranı, belge işleme başarı oranı, kullanıcının ilk 10 dakikadaki tamamlanan anlamlı adımı için haftalık kalite panosu kur.
3. Astra ile yeniden aynı PDF/sınav tarihi/kullanıcı görevi matrisi üzerinden kör değerlendirme yap; başarıyı görsel benzerlik değil, öğrenme çıktısı ve hata oranı belirlesin.

**Bitiş tanımı:** Kod derlemesi ve tek canlı başarı yeterli değildir. Her öncelikli akış, yeni hesap ve farklı belge türüyle tekrar edilip yanlış kaynak, yanlış cevap, kredi kaybı, sonsuz bekleme ve erişilemeyen sonraki adım için sıfır kritik bulgu vermelidir.
