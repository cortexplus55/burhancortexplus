# Trigonometri PDF akışı ve Astra karşılaştırması

## 14 günlük canlı akış testi

21 Eylül 2026 hedef tarihli `db9b08dd-0efa-4457-ae36-aef40fbd2942` hazırlığı, plan yazıldıktan sonra bekletilmeden 14 günün tamamı sırayla çalıştırıldı. Podcast, soru-cevap, quiz, doğru/yanlış, sözlü, aralıklı tekrar, zayıf nokta, bilgi kartı ve süreli yazılı türlerinin her biri gerçekten üretildi; sonuç kaydı ve bir sonraki düğümün açılması doğrulandı. Son düğümün “Devam et” bağlantısı hazırlık özetine döndü.

Canlı testte bulunan ve giderilen sorunlar:

- Plan önizlemesi tarih alanının bulanıklaşmasına bağlıydı; açık bir “Çalışma yolunu hazırla” eylemine dönüştürüldü.
- Giriş quizi hazırlığa seçilen PDF'i kullanmıyordu; belge bağlamı eklendi.
- Başarısız içerik üretimi boş ders ekranına dönüşüyordu; artık hata döndürüp yeniden denemeye izin veriyor.
- Premium quiz üretimleri gelişmiş modele taşındı ve çoklu seçim/cevap-açıklama tutarlılığı kuralları güçlendirildi.
- Bilgi kartlarının son yanıtı React durum güncellemesi tamamlanmadan sunucuya gönderildiği için 8/8 yerine 7/8 kaydoluyordu; son yanıt artık tamamlama isteğine doğrudan ekleniyor.
- Sözlüde uzunluğu sekiz karakteri aşan her metin doğru sayılıyordu; yanıtlar artık soruyla ilgisi ve içerik doğruluğu açısından yapay zekâ ile değerlendiriliyor.

Kalan içerik riski: Gelişmiş model, önceki modele göre belirgin biçimde daha tutarlı sorular üretti. Yine de tek üretimde referans açı açıklamasının 0°–360° aralığı ile karıştırıldığı bir soru görüldü. Bu nedenle model seçimi tek başına kesin doğruluk garantisi değildir; ileride ikinci bir matematik doğrulama geçidi eklenmelidir.

## Kapsam

Kullanıcının iki ürüne yüklediği `trigonometri_konu_anlatimi.pdf`: 75.450 bayt, 20 fiziksel sayfa. Astra Plus ve Cortex Sigma oturumlarıyla, aynı ana istem üzerinden manuel karşılaştırma. Bu tek belge deneyi genel model sıralaması değildir. Modelin iç muhakemesi değil, gösterdiği çözüm ve ürün akışı değerlendirildi.

## Düzeltilen akış

- Ham PDF içeriğinde parantez tarayan yöntem kaldırıldı. Gerçek dosyada bu yöntem 28 NUL karakteri çıkarıyordu; canlı kayıt `page_insert_failed` durumundaydı.
- PDF.js ile sıkıştırılmış akışlar ve Türkçe metin fiziksel sayfalar halinde okunuyor.
- PDF worker ve yardımcı dosyalar Vercel paketine dahil edildi; ilk canlı denemede eksik worker nedeniyle oluşan `processing_failed` giderildi.
- Başarısız/bekleyen belgeler yeniden işlenebiliyor; hata sonrası liste yenileniyor.
- Hazır belgeden “Bu belgeyle sohbet et” bağlantısı eklendi.
- Sohbetin yalnızca görselleri okuyup PDF ekini sessizce yok sayması düzeltildi. PDF/TXT içeriği sahiplik kontrolünden sonra okunuyor; okunamayan dosyada kredi ayırmadan hata dönüyor.
- Aynı açık sohbet içindeki takip soruları belge kimliğini koruyor.
- Liste içindeki çok satırlı LaTeX formüllerinin satır satır parçalanması düzeltildi.
- Belgedeki konu numaralarının fiziksel sayfa numaralarıyla karıştırılmaması için toplam sayfa sayısı ve kaynak etiketleri açıkça veriliyor.

## Canlı doğrulama

Belge `5b002624-b6dc-4fc0-9330-09f93b14040a` canlıda `completed`: 20 sayfa, 20 metin parçası, hata alanı boş. “Hazır” etiketi ve sohbet bağlantısı tarayıcıda görüldü. PDF aynı kayıt üzerinden, tekrar yüklenmeden kurtarıldı.

## Aynı ana istem

> Yüklediğim trigonometri PDF’sine dayanarak konunun ana başlıklarını sayfa numaralarıyla özetle. Ardından belgedeki bir çözümlü örneği seçip işlemleri ve nedenlerini adım adım açıkla. Son olarak konuyu anlayıp anlamadığımı ölçen 3 kısa soru sor; cevaplarını henüz verme. Belgede okuyamadığın bir bölüm varsa açıkça belirt.

## İlk yanıtların karşılaştırması

| Ölçüt | Astra Plus | Cortex Sigma |
|---|---|---|
| Dosya okuma | PDF kabul edildi | Düzeltmeden önce başarısız; düzeltmeden sonra 20 sayfa okundu |
| Örnek | Sayfa 19: sin x=5/13, II. bölge | Sinüs teoremi: A=30°, B=45°, a=6 |
| Hesap | cos x=-12/13, tan x=-5/12 doğru | b=6√2 doğru |
| Gerekçe | Özdeşlik, karekök ve bölge işareti açıklandı | Orantı ve yerine koyma açıklandı |
| Mini test | Üç soru, cevaplar saklı; ikinci sorunun tanım koşulu hatalı | Üç soru, cevaplar saklı; daha çok tanım/hatırlama düzeyinde |
| Sayfa atıfları | Genel olarak fiziksel sayfalarla uyumlu | İlk denemede bölüm numaralarını sayfa sanıp 21–22 verdi; düzeltme eklendi |
| Formül görünümü | Okunur; not kutusu işareti ilk yanıtta ham göründü | İlk denemede liste içi çok satırlı formüller ham göründü; renderer düzeltildi |

Astra mini testte `(1−sin²x)/cos x` için `sin x ≠ 0` koşulunu verdi. Doğru koşul `cos x ≠ 0` olmalı. Açık takip sorusunda hatayı kabul edip düzeltti; III. bölge ile pozitif sinüsün çelişkisini de doğru açıkladı.

## Takip sorusu bulgusu

Cortex III. bölgede sinüsün negatif olacağını ve paydanın `cos x ≠ 0` koşulunu doğru belirledi. Ancak devamında “sin x=5/13 yalnızca II. bölgede tutarlıdır” dedi; I. bölgeyi dışlayan bu ifade yanlıştır. Ayrıca sinüsün değer aralığını tanım kümesi gibi anlattı. Bu nedenle dosya akışının onarılması, matematiksel yanıt kalitesinin kusursuz olduğu anlamına gelmez. Bu örnekte Astra'nın takip açıklaması daha tutarlıdır.

Son regresyon paketi: 35 dosyada 276 test başarılı; TypeScript kontrolü başarılı. Çok satırlı liste formülleri için ve aynı sayfadaki farklı numaralı bölümler için ayrı testler eklendi.

## Son canlı kontrol — 7 Eylül

`4e3b78a` Vercel dağıtımı başarılı. Bölümlerin yanına fiziksel sayfa etiketleri eklenen kaynakla yeni sohbet açıldı. Sinüs Teoremi 15, Kosinüs Teoremi 16, Alan 17, Uygulamalar 18, Karma Sorular 19, Genel Tekrar 19 olarak doğru yanıtlandı. `sin x=5/13`, II. bölge örneğinde sonuçlar `cos x=-12/13`, `tan x=-5/12` doğru. Yanıtta 15 KaTeX formülü tarayıcıda oluştu; ilk testte görülen ham çok satırlı LaTeX sorunu bu yanıtta görülmedi.

Sonuç: Bu 20 sayfalık metin katmanlı PDF için işleme → hazır belge → sohbet → kaynaklı çözüm akışı çalışıyor. Tek test tüm dosyalarda veya bütün matematik yanıtlarında hatasızlık garantisi vermez. İlk eşit istem denemesinde Astra daha düzenli ve daha uygulamalı mini sorular üretti; Cortex'in kaynak ve gösterim sorunları giderildi, ancak takip açıklamasında gözlenen matematiksel genelleme hatası kalite açığı olarak duruyor.

## Sınırlar

- Metin katmanı olmayan taranmış PDF için OCR eklenmedi; açık hata verilir.
- Sohbete alınan belge metni 80.000 karakterle sınırlı; daha uzunsa açık hata verilir.
- Yeni açılan/eski geçmiş sohbetlerinde belge ilişkisinin kalıcı veritabanı kaydı ayrıca ele alınmalı; mevcut düzeltme açık sohbeti ve `belge` bağlantısını kapsar.
- Yanıt süreleri eşzamanlı ölçülmedi; hız üstünlüğü iddiası yok.
- Kredi hesabının sayfa başına fiyat metniyle uyumu bu karşılaştırmada doğrulanmadı.

## Ayrıntılı belge turu — 7 Eylül

İkinci karşılaştırmada `trigonometri_20_sayfa_detayli.pdf` (133.607 bayt) iki ürüne de yüklendi. Astra dosyayı sohbet gönderimiyle birlikte kabul etti. Cortex dosyayı `71cd76fd-3ea2-4c4e-b6a0-d90b344ec937` kimliğiyle işledi ve yaklaşık 30 saniye içinde **Hazır** durumuna getirdi.

İki ürüne aynı istem gönderildi: 6–8 maddelik kavram haritası, belgeden iki çözümlü örnek, fiziksel sayfa numaraları ve cevapları saklı üç kademeli soru. Astra 6 maddelik harita, sayfa 2'den radyan/yay uzunluğu ve sayfa 9'dan iki kat açı örneği üretti. Cortex 8 maddelik harita, sayfa 2'den 225° dönüşümü ve sayfa 4'ten sin 60° örneği üretti. İki ürün de takip testinde `cos 120° = +1/2` yanılgısını cevabı doğrudan söylemeden bölge → işaret → referans açı sırasıyla ele aldı ve yeni bir soru sordu.

İlk DOM metin incelemesinde Cortex kesirleri ters yazmış gibi görünüyordu. Görsel kontrol bunun KaTeX'in erişilebilirlik metnindeki okuma sırası olduğunu gösterdi; öğrenci ekranında `225° × π/180 = 5π/4` ve `sin 60° = √3/2` doğru gösteriliyor. Bu nedenle ilk “matematik hatası” kaydı bu tur için geçerli değildir.

Gerçek bağlantı hatası model yönlendirmesinde bulundu: `>10` sayfalık belgeleri gelişmiş modele taşıyan kural vardı, fakat sohbet rotası fiziksel sayfa sayısını yönlendiriciye göndermiyordu. `4313bb0` ile sayfa sayısı bağlandı. Aynı değişiklik belge örneğini kaynakta bulunan soru ve verilerden seçme, sonuçtan önce işaret/kesir/aritmetik kontrolü yapma talimatlarını ekledi. 35 test dosyasında 276 test, TypeScript kontrolü ve üretim derlemesi geçti; değişiklik canlıya gönderildi ve ayrıntılı PDF ile yeniden doğrulandı. Temiz canlı sohbette Cortex sayfa 6'daki `sin 240°` örneğini `−√3/2` olarak doğru çözdü. Takipte `cos 120° = +1/2` yanılgısına karşı cevabı açıklamadan bölge → referans açı → birim çember ipuçlarını verdi ve `sin 135°` sorusuyla devam etti. Belge bağlamı takip mesajında korundu.

Kalite hedef tarihi **21 Eylül 2026**. O tarihe kadar iki günde bir yükleme, kaynak bağlılığı, sayfa atfı, matematik doğruluğu, öğretim sırası, aşamalı ipucu, takip bağlamı ve yanıt süresi ölçülecek. Otomatik takip yalnızca anlamlı değişiklik veya kullanıcı eylemi gerektiğinde bildirim üretir.

## İzleme — 9 Eylül 2026, 01:25 İstanbul

- Yerel HEAD `29da57d`. Aşama 2–6 için yeni kod ve doğrulama notları mevcut; takip kodunda program ilerlemesi, konu hâkimiyeti ve hazırlık tahmini ayrı hesaplanıyor. Aşama 6 notu geçici bayrak testinden sonra `pdf_learning_v2` bayrağının yeniden kapatıldığını kaydediyor. Bu izleme turunda bayrak durumu veritabanından bağımsız doğrulanmadı; özellikler herkese açılmış kabul edilmedi.
- Canlı, mevcut trigonometri hazırlığının doğru/yanlış etkinlik sayfası oturumla açıldı ve aşinalık seçimi göründü. Sayfanın boş kalması bu kontrolde gözlenmedi. Yeni içerik üretimi/tamamlama bu turda çalıştırılmadı; önceki üretim hatasının çözüldüğüne dair yeni kanıt yok.
- Kaynak bulunamadığında durma kontrolü ve deterministik içerik doğrulaması kodda mevcut. Bunlar tek başına fiziksel sayfa atıfları, bütün PDF kapsamı veya matematik doğruluğu kabulü değildir.
- Astra oturumu açık sekmelerde bulunmadığından yeni eşit istem kıyası yapılmadı. Üç kademeli sorular, aşamalı ipucu, takip bağlamı ve yanıt süreleri için önceki karşılaştırma sınırları geçerli.
- Yeni öğrenciye açık kalite iyileşmesi veya gerileme doğrulanmadı; ek kullanıcı eylemi istenmedi ve rutin bildirim gönderilmedi. Son hedef tarihi 21 Eylül olarak korunuyor.

## İzleme — 11 Eylül 2026, 01:26 İstanbul

- Yerel HEAD `019046d`; GitHub Vercel commit durumu `success`. 59 dosyada 498 test geçti. Bu turda ürün kodu veya şema değiştirilmedi; mevcut kaydedilmemiş reschedule çalışması korundu.
- İçerik ev stili okundu. Kodda öğrenme rolü artık `lesson`; konu ilerleme sekmeleri, sınava bağlı sohbet bağlantısı ve ders şablon başlıklarını ayıklama değişiklikleri mevcut. Bunların tüm belgelerde üretim kalitesi sağladığı yalnızca koddan çıkarılamaz.
- Canlı trigonometri hazırlığı `db9b08dd-0efa-4457-ae36-aef40fbd2942` yenilendi: ekran açılıyor; iki kalan gün göstergesi de 10. Yeni çalışma yolu/konular sekmeleri ve “Bu sınav için sor” bağlantısı görünür. %100 program ilerlemesi, %17 konu hâkimiyeti, %12 hazırlık ve 1 ölçülen/10 ölçülmemiş konu ayrımı korunuyor.
- **Yeni görünür tutarsızlık:** aynı hazırlıkta “Konular 0” yazarken Açı-Radyan aktif konusu ve 11 konuluk ölçüm özeti var. `topicProgressFromNodes` yalnızca `sessionMeta.topicTitle` bulunan düğümleri sayıyor, bu alanı olmayanları atlıyor. Dolayısıyla eski hazırlıklar için sıfır konu göstergesi belge kapsamını temsil etmiyor. Eski plan/konu haritası uyumluluğu incelenmeli; veri kaybı olduğu iddia edilmiyor. Sekme tıklaması tarayıcı komutunda zaman aşımına uğradı; sekme içeriği ayrıca doğrulanmadı.
- Astra'nın aynı trigonometri hazırlığı (7501226) açık: 5 konu, %5 ilerleme, %75 hedef; sıradaki alıştırma Dik Üçgende Oranlar ve Özel Açılar. Yeni sürüm bildirimi var; yeni eşit istem üretimi yapılmadı.
- Yükleme/işleme, fiziksel sayfa atıfları, yalnızca belgeye dayanma, matematik doğruluğu, kavramsal anlatım, üç kademeli soru, aşamalı ipucu ve takip bağlamı için bu turda yeni içerik testi yok. Önceki sonuçlar geçerli; yeni kod bunları otomatik olarak geçmiş saydırmaz. Yanıt süresi ölçülmedi.
- Chrome yeniden bağlı ve doğru Supabase projesinin SQL Editor sekmesi mevcut görünüyor. Bu, giriş engelinin yeniden kontrol edilebileceğini gösterir; fonksiyonun uygulanmış olduğu veya SQL çalıştırma yetkisi bu izleme turunda doğrulanmadı. Önceki “giriş yap” gereksinimi otomatik tekrarlanmadı.
- Anlamlı yeni bulgu: eski trigonometri hazırlığında konu sayısı tutarsızlığı. 21 Eylül son karşılaştırma hedefi korunuyor; tam kalite eşdeğerliği sonucu yok.
