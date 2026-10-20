# İçerik ev stili — konu, ders, podcast

**Tarih: 10 Eylül 2026.** Aynı zemin mekaniği PDF'i Astra'ya ve Cortex'e
yüklendi, üretilen her şey yan yana kondu. Buradaki kurallar o
karşılaştırmadan çıktı ve **kodda duruyor** — prompt metnine yazılmış iyi
niyet değil, doğrulayıcı. Binlerce PDF aynı elden çıkmış gibi görünsün diye.

Kural değiştirmeden önce: bu dosya nedeni anlatır, kod nasılını. İkisi
ayrışırsa kod haklıdır, bu dosya güncellenir.

---

## 1. Konu bölme

Kod: `src/lib/documents/topic-title.ts`, `src/lib/documents/topic-fold.ts` · Test: `tests/unit/topic-title.test.ts`, `tests/unit/topic-fold.test.ts`

Belgenin içindekiler tablosu bir konu listesi **değildir**. Konu listesi
öğrencinin yükleme sonrası gördüğü ilk ekran; orada bölüm numarası ve
parantez içi kısaltma hiçbir şey öğretmiyor.

| Kural | Kod |
|---|---|
| Yaklaşık 3 öğretim sayfasına 1 konu (yoğunluk ipucu; sabit üst sınır yok) | `targetTopicCount` |
| Sayfa yoğunluğu sınırı kutuları ve örnekleri toplar; belgedeki bağımsız numaralı bölümler korunur | `topicCeiling`, `mapCeiling` |
| Kutu, çözümlü örnek adımı, tekrar ve kısa/uzun çift konu değildir | `topic-fold.ts` |
| Baştaki bölüm numarası ve sondaki parantezli kısaltma atılır | `normalizeTopicTitle` |
| "Sayfa N", tek kelimelik, cümleye dönmüş başlık elenir | `topicTitleIssues` |
| Kapsam adı eklenir, önemli alt başlık "ve" ile terfi eder, sınanamayan bölüm komşusuna katılır | `TOPIC_TITLE_RULE` |

Gözlenen fark:

```
biz:   "3. Dane Boyu, Kıvam Limitleri ve Sınıflandırma (USCS)"
Astra: "Dane Boyu Dağılımı ve Zemin Sınıflandırması"
biz:   "5. Efektif Gerilme İlkesi"
Astra: "Efektif Gerilme İlkesi ve Sızma Kuvvetleri"      (5.2'den terfi)
biz:   "1. Zeminin Oluşumu ve Üç Fazlı Sistem"
Astra: (konu değil — tek başına sınanamıyor, 2'nin açılışı)
```

Elenen başlığın sayfaları silinmez. Çözümlü örnek, adındaki kavrama
katılır; kutu ve bölüm sonu tekrarı, sayfanın kendi bölümüne ya da
ondan önceki konuya bağlanır. Kapsama düşmez, harita tümden çöpe gitmez.

**27 Eylül 2026 düzeltmesi:** 10 sayfalık pediatri kaynağının her sayfası
ayrı bir numaralı bölümdü. Eski sekiz konu tavanı Kardiyoloji ile Pediatrik
Aciller ve Aşı Mantığı bölümlerini listeden düşürüyor; bu sayfaları komşu
konulara bağlayan kapsama raporu da yanıltıcı biçimde 10/10 diyordu.
Bağımsız bölüm artık sayfa yoğunluğu ipucundan üstündür. Kapsama denetimi
yalnızca sayfa bağlantısını değil, bölüm adının konu haritasında temsil
edilmesini de arar. Uzun belgelerin haritası 12 öğretim sayfalık kalıcı
parçalar hâlinde işlenir; başarısız istek tamamlanan parçaları kaybetmez.

Aynı dosya yeniden yüklenince eski harita kopyalanmaz; her yükleme yeni
bir belgedir. Eski kuralda kaydedilmiş ve hâlâ kutu ya da tavanın üstünde
başlık taşıyan hazır harita, belge açılınca model çağrılmadan katlanır.
Öğrencinin onayladığı, elle düzenlediği ya da bir sınav hazırlığına
bağladığı harita olduğu gibi kalır. Eski konu düğümleri, yenileri
yazılmadan silinmez.

### Konuların sırası belgenin sırasıdır

Kod: `orderTopicsByPrerequisites` · Test: `tests/unit/exam-schedule-v2.test.ts`

Yeni bir hazırlıkta hiçbir konu ölçülmemiştir; hepsinin puanı eşittir ve
sıralamayı yalnızca eşitlik bozucu belirler. Eşitlik bozucu bir süre
**alfabe** kaldı ve kimse görmedi: canlıdaki zemin mekaniği planı kitabın
üçüncü bölümüyle başlıyor, temeli olan "Üç Fazlı Sistem" ile bitiyordu.
Konu haritası sadeleştirilirken ön koşul çıkarımı kalkınca alfabe tek
ölçüt hâline gelmişti.

Konular haritadan belgenin kendi sırasıyla çıkıyor — yazarın öğretim
sırası. Ölçülmüş bir zayıflık yoksa o sıra korunur; ölçülmüş zayıflık
öne geçer. **11 Eylül 2026'da düzeltildi.**

---

## 2. Ders adımları

Kod: `src/lib/learning/teaching-standards.ts` (`validateLessonPedagogy`),
`src/lib/learning/learner-fluency.ts` (`repairTurkishSurface`),
`src/lib/learning/quantitative-audit.ts` (`auditQuantitative`),
`src/lib/learning/absolute-claims.ts` (`unsupportedAbsoluteClaims`)

Astra'nın dersi baştan sona gezildi. İskelet şu:

1. **Kanca** — dersin tam adı, konuya girmeden önce tek paragraf
2..n. **Kavram adımı** — başlık kavramın adı, metinde anahtar terimler
   koyu, tuzak akışın içinde ayrı kutuda, **her ekran kendi sorusuyla biter**
   (20 Ekim 2026'dan beri; önce yalnız kavramın son ekranı)
n+1. **Özet ve gelecek bakış** — özet + **sonraki konunun adı**
n+2. **Tekrarla** — geldiği bölümün adıyla etiketli hatırlama sorusu
son. **Kapanış** — kendini test et

Bizde uygulanan kurallar:

- Bölüm başlığı şablonun adı olamaz (`isScaffoldHeading`). Üretilen bir
  zemin dersinde beş başlık "Kısa Açıklama / Kaynağa Dayalı Örnek /
  Yaygın Hata / Orta Bilgi Kontrolü / Kısa Kapanış" çıkmıştı — öğrenci
  içindekilerden ne öğreneceğini değil, üretim şablonumuzu okuyordu.
- Hedef başlığı tekrarlayamaz ("X konusunu öğren.").
- Genel bakış içi boş olamaz ("Bu derste X açıklanacak…").
- 4+ bölüm varsa en az 2 ara kontrol.
- Çözümlü örneğin **her adımı** kendi başına doğru olmalı.

Çeldirici kuralı (Astra'dan): bir adım N kardeş terim tanımlıyorsa
kontrol "hangisi bu tanıma uyar" diye sorar, çeldiriciler diğer
kardeşlerdir. Açıklama doğru şıkkı onaylamakla kalmaz, **her çeldiricinin
gerçekte ne olduğunu** söyler ve kaynağa yaslanır ("Metne göre…").

Şık sırası kuralı (18 Ekim 2026): şıklar öğrenciye karışık sırayla gösterilir
(model doğru cevabı neredeyse hep ilk şıkka yazıyordu). Bu yüzden açıklama bir
şıkka **sırasıyla ya da harfiyle gönderme yapmaz** ("ilk seçenek sabit basınçta…",
"diğer seçenekler sırasıyla bronşiolit, astım…" yanlış şıkkı gösterir); her
şıkkı kendi içeriğiyle anar. Altın kıyasta hakemin bulduğu sorunların yarısı
buydu. Kural: `option-reference.ts`; ders ve test motorunda yazar, denetçi, kod.
20 Ekim 2026'dan beri dedektör "ilk iki ifade", "sırayla" ve cümle başındaki
büyük "İ"yi de yakalıyor (JS'in `i` bayrağı "İ"yi "i" saymıyordu); "madde"
şık sayılmıyor — "Anayasanın ilk üç maddesi değiştirilemez" KPSS'in çekirdek
bilgisi ve itiraz edilemeyen yapı kuralı onu yazdırmıyordu. Ders denetçisi
kuralı yazarla aynı cümleyle okur.

---

### Ders motoru: öğretim kalitesi (20 Ekim 2026, kör kıyas)

Kod: `src/lib/learning/teacher-lesson.ts`, `teacher-lesson-run.ts`,
`teaching-rubric.ts`, `teacher-brain.ts` (`reviewItemProblems`,
`acceptReviewVariant`, `reviewQuestionFor`) · Test:
`tests/unit/lesson-teaching-quality.test.ts`, `tests/unit/retry-key.test.ts`,
`tests/unit/lesson-stream-pipeline.test.ts`

Aynı belgeyle (KPSS anayasa, trigonometri, Pediatri gelişim) Astra ve
Cortex dersleri körlemesine, hakem modellerle yan yana puanlandı. Doğrulukta
beş çiftin beşi bizdeydi; öğretimde değil. Bu bölümün her satırı o kıyasta
somut bir dersten çıktı.

**İkinci soru (review) tam öğe — yanlış anahtar olayı.** Yazara "aynı kavramı
farklı yönden sor; şıklar aynı kalır" deniyordu; yazar yalnız kök yazıyor,
kod ana sorunun anahtarını o köke veriyordu. Kökler başka şıkkı soruyordu:
konfederasyon kaçırana "tek hukuk + milli birlik" (cevabı üniter devlet)
"Konfederasyon" anahtarıyla, Pediatri'de "12 aylıkken dil becerisi" (cevabı
1-3 anlamlı kelime) "2 kelimeli cümleler" anahtarıyla soruldu. İncelenen üç
tekrarın üçünde öğrencinin **gerçekten doğru** ikinci cevabı yanlış sayıldı,
o yanlış anahtar yanılgı kayıtlarına ve aralıklı tekrar kartlarına da yazıldı.

| Kural | Nerede |
|---|---|
| İkinci soru tam öğedir: kendi şıkları, anahtarı, açıklaması (doğru/yanlışta doğrusu); en olası yanlış seçimi ölçen **yeni** bir durum; çoktan seçmelide doğru şık ana sorununkiyle **aynı metin** | istem `review` kuralı, şema |
| Yapı denetimi ve çalışma anı aynı listeye bakar: yazar tam olarak çalışma anında reddedilecek şeyi düzeltir (çoktan seçmelide yüksek, doğru/yanlışta düşük) | `reviewItemProblems` |
| Yalnız kök tekrar artık kabul edilmez (anahtarı denetlenemiyor); geçerli öğe yoksa kod yedeği çalışır | `acceptReviewVariant` |
| Ders içi ikinci soru kaçırılan **olguyu** yeniden sınar: kaynağın başka cümlesini ya da başka bir sıcaklığı soran yedekler çalışmaz; notlandırma, mühürlü tekrar ve eski istemci yolu aynı bayrakla. Odaklı pratik bayraksız | `reviewQuestionFor(…, { sameFactOnly })`, `reviewGateQuestion` |
| Şık gerekçesi yalnız kendi şıkkının altında: kayan şıkla gerekçe de kayar, yeni şık dizisinde ana sorunun gerekçeleri taşınmaz | `shiftOptions`, `resolveCheckForGrade` |
| İkinci sorunun şıkları da kendi kökünden türeyen sırayla karışır | `shuffleLessonChecks` |
| Denetçi ikinci soruyu da her soru gibi çözer: başka kavramı sorması ya da doğru şıkkın farklı olması C | `VERIFY_SYSTEM` C/D |

**Her ekran bir soruyla biter; yoğun tablo bölünür.** Pediatri'nin gelişim
tablosunu Astra beş ekran içi soruyla öğretti, biz iki soruyla geçtik. Kural:
her ekran tek bir soruyla biter (yalnız ilk ekranın sorusu başta: önce dene);
5 ya da daha çok satırlı tablo aynı kavramın 2-3 ekranına satır gruplarıyla
bölünür, her ekranın sorusu komşu satırları ayırt ettirir. Bölünen tablo
**ikinci kavramdan** başlar: ilk kavram tek ekran (soğuk ilk ekran p95 < 20 sn
hedefi; ilk kavramda yoğun tablo kuralı düşük önem). Kural yalnız kavramın kendi
tablo bloklarına bakar — 20 Ekim'deki "aynı tablo" döngüsü yeniden kurulmasın;
kavram iki tablo ekranına bölündüyse ya da zaten üç ekransa sağlanmış sayılır.
Ekran üst sınırı 7 → **9** ve sınır aşımı **düşük önem**: sınır ancak dersin
kapanışında denetleniyordu, aşımı önceki kavramlar yapıyordu ve son kavram
düzeltemeyeceği bir sorun için baştan yazılıp atılıyordu.

**"Günlük hayattan" yerine "Örnek vaka".** Gündelik örnek kutuları düz
kaldı ("ebeveyn ölçümü eğriye işler"). Yeni kutu: başlık "Örnek vaka: …",
sonucunu kavramın belirlediği kısa, somut bir durum (kavram değişse sonuç
değişirdi); vakadaki her sayı, eşik ve sonuç kaynakta geçer. Eski başlık
kabul edilmez (yapı kuralı yüksek).

**Ezber kodu isteğe bağlı.** Kodların çoğu yalnız sırayı ya da baş harfleri
taşıyordu ("ÜB-FK", "Soylu sınıf dine…"); sınav sırayı değil ayrımı soruyordu.
Kod yalnız iki durumda yazılır: sınav kategoriyi ve onu ayırt ettiren ipucunu
soruyorsa kod eşlemeyi taşır ("Soyda Mon, zümrede Oli, din adamında Teo,
toplumda Cum"); sınav listenin tamamını ya da sırasını soruyorsa liste kodu
("İpek Ceza Taktı, Cebir Hükmetti"). Yoksa kutu yazılmaz; denetçi "kod yok"
diye itiraz etmez. İlk kavramda ayrım taşımayan kod tur açmadan çıkar.

**Öğretim ölçütü ve 'medium' önem.** Tekrar, kaynağın kısaltmasını
açıklamadan aktarma ("ayrı hukuk sistemi + uluslararası sözleşme"),
tanımlanmadan sorulan terim ("eş yönlü"), kutunun işini anlatan boş cümle
("sırasını hatırlatır"), döngüsel tanım, üstündeki cümleyi geri soran soru.
Yazar ve denetçi bunları **aynı metinle** okur (`TEACHING_RUBRIC`). Denetçi
bunları `medium` yazar: öğretimi zayıflatır ama yanlış bir şey öğretmez.
`medium` ilk kavramda tur açmaz; sonraki kavramlarda en çok **bir** kavram içi
tur açar, düzeltme yüksek bir sorun getirirse önceki ekranlar yayımlanır —
`medium` hiçbir kavramı attırmaz ya da baştan yazdırmaz ("atılan kavram 0").
Yönetim kaydında bu turlar `[öğretim]` önekiyle görünür.

**Kaynak kuralının dar istisnası.** Ölçütün "neden ve nasıl" ve "terimi
açıkla" maddeleri kaynak kuralıyla çakışıyordu (denetçi A: "kaynakta dayanağı
yok"). İstisna dar: kaynaktaki iki bilgiyi birbirine bağlayan neden cümlesi
ve yabancı terimin birebir Türkçe karşılığı yeni bilgi sayılmaz; kaynakta
tanımı olmayan bir terimi dışarıdan açıklamak yine yalnız "Genel bilgi"
kutusunda (ders başına en çok iki). Yazar ve denetçi aynı cümleyi okur
(`SOURCE_LINK_EXEMPTION`).

**Yer tutucu başlık.** Şemanın örnek başlığı ("X ile Y farkı") iki derste
aynen ekrana çıktı. Yapı kuralı şemadan kopyalanan değerleri yakalar ("X ile
Y", "<karıştırılan kavram>", "…", "kardeş kavram", "ikinci kavramın adı");
"Hepatit A ile B farkı", "X ile Y kromozomu farkı", "Yokluk ile butlan farkı"
gerçek addır.

---

### Öğrenme adımı ders, podcast değil

Kod: `src/lib/learning/exam-schedule-v2.ts` (`ROLE_KIND`)

**10 Eylül 2026'ya kadar `learn: "podcast"` idi.** Planda her konunun
"· Öğren" düğümü bir podcast üretiyordu — veritabanında 57 podcast
düğümünün başlığı "… · Öğren". Podcast bir ekstra değil, öğretmenin
kendisiydi.

İki bedeli vardı. Öğretme en kırılgan ve en pahalı üretim türüne
bağlıydı: pediatri podcast'i iki denemede de düştüğünde öğrencinin o
konuda okuyacak hiçbir şeyi kalmadı. Ve sesli metne geri dönülemiyor —
formül tekrar okunamıyor, başlığa göz atılamıyor.

Artık `learn: "lesson"`. Astra'nın öğrenme adımı da metin ("Akıllı
Metin"); podcast onda da seçmeli.

---

### Şekille anlaşılan konuya çizim

Kod: `src/lib/learning/lesson-diagram.ts` · Test: `tests/unit/lesson-diagram.test.ts`

Model **ham SVG üretmez**. Çizimin tarifini yazar — sayılar ve etiketler —
SVG'yi biz kurarız. Modelden gelen hiçbir metin işaretleme olarak
yorumlanmaz. Renk de serbest değil: tema jetonlarına bağlı bir isim
kümesi, böylece çizim açık ve koyu temada birlikte çalışır.

Bu bölümün her satırı canlıda çıkmış bir hatadan geliyor:

| Olan | Kural |
|---|---|
| "İsteğe bağlı" diyen talimatı model hep atladı | Konu adı ya da kaynağın alt başlığı bir ŞEKİL kelimesi taşıyorsa çizim zorunlu (`needsDiagram`) |
| "ZORUNLU" yazdık, yine çizmedi | Çizim artık **doğrulamaya bağlı**: çizimsiz taslak yeniden çizdiriliyor |
| İstemdeki örnek olduğu gibi kopyalandı ("Kili temsil eder" yazan bir kutu) | İstem biçimi gösteriyor, çizimi değil |
| Çemberin yanına "Daire" yazıldı | En az iki etiket, en az iki şekil; başlığı tekrarlayan etiket reddedilir (`diagramIssues`) |
| "Drenajsız (c u, φ u ≈ 0)" kutunun sağından taşıp kesildi | Yerleştirmeyi biz yapıyoruz (`placeLabel`) |
| İki kutu üste çizildi, altı bomboş kaldı | Çerçeve çizilene daraltılıyor (`diagramViewBox`) |

Kelime listesi KONU adı değil ŞEKİL kelimesi taşır ("döngü", "kesit",
"eksen", "harita"…): kimya öğrencisinin "Lewis Yapısı" da, biyolojinin
"Krebs Döngüsü" de tetiklemeli. Liste yine de dar — her konuya çizim
istemek çizimi değersizleştirir ve modeli kelimeyle anlaşılan bir şeyi
kutularla anlatmaya zorlar.

## 3. Podcast

Kod: `src/lib/learning/teaching-standards.ts` (`validatePodcastPedagogy`,
`emptyMistake`) · Prompt: `src/app/api/learning/exam-prep/node/route.ts`

Evre sırası (tanım → neden → örnek → hata → özet) duruyor; **evrenin adı
başlık olamaz**. Eski kural tam tersini yapıyordu: başlıklarda bu adları
*arıyor*, bulamazsa reddediyordu. Model de en ucuz yolu seçti ve zemin
podcast'inde beş bölümün beşi de "TANIM / NEDEN / ÖRNEK / YAYGIN HATA /
ÖZET" adını aldı.

"Yaygın hata" öğüt olamaz (`emptyMistake`). "Dane boyu dağılımını
anlamadan sınıflandırma yapmak yanlıştır" bir hata değil; "LL yerine PI
kullanmak" bir hatadır. Bir öğüt cümlesi tolere edilir, ikisi edilmez —
her satırı ayrı ayrı reddetmek podcast üretimini tümden düşürüyordu.

Podcast **Plus'a özel** ve **dersin devamı**: öğrenci konuyu okuyup
bitirince sonuç ekranında "Şimdi dinle" çıkar. Kaynağı ham PDF değil,
az önce okunan ders (`generatePodcastFromLesson`); ders yoksa podcast de
yok. Ses üretimi podcast maliyetinin %98,4'ü.

## Doğrulayıcı yazarken sorulacak soru

**"Bu kontrol hiçbir taslağı geçirmezse ne olur?"**

10 Eylül'de aynı hataya iki kez düşüldü:

| Kontrol | Hiçbir taslak geçmeyince |
|---|---|
| Konu haritası bölüm bekçisi | Harita `null` → trigonometri fikstürüne düşüldü, pediatri belgesinde "Derece ve radyan" çıktı |
| Podcast `emptyMistake` | Podcast hiç üretilemedi, "oluşturulamadı" |

Kabul edilebilir bir cevabı yoksa kontrol ya gevşetilmeli ya da
reddetmek yerine tavsiyeye çevrilmeli (bkz. `lastValidDraft`).

---

## 4. Eşik ve sınıflandırma — bütün üretimleri kapsar

Kod: `src/lib/ai/generate.ts` (`CONTENT_STYLE`)

Canlı podcast şunu söylüyordu:

> "Bir zemin, No.200 eleğinden %8 geçiyorsa, ince daneli sayılır."

PDF'in kuralı tersi: geçen oran **%50'yi aşıyorsa** ince daneli, ve PDF'in
kendi örneğinde %8 **kaba** daneli. Model sayıyı doğru kopyalamış, sonucu
ters çevirmiş. Sesli içerik en tehlikeli yeri: öğrenci dinlerken bir
yazıyı sorguladığı gibi sorgulamıyor.

Kural: **değer, yön ve sonuç kaynaktan birlikte gelir.** Kaynağın örneği
kullanılıyorsa vardığı sonuç da aynen kullanılır.

Bu bir güvenlik ağı değil — regex anlam tersine dönmesini bilemez. İki
katman var: üretimde ortak stil kuralı, bağımsız incelemede açık talimat.
Kalıcı çözüm podcast'i **doğrulanmış ders içeriğinden türetmek**; henüz
yapılmadı.

---

## Astra'dan bilerek ayrıldığımız yerler

| Astra | Biz | Gerekçe |
|---|---|---|
| LaTeX render | Konuşulabilir Unicode | Aynı metin podcast ve sesli anlatımda okunuyor |
| ~~Çalışma yolunda tek "sonraki iş" kartı~~ | ~~Gün gün plan~~ | **11 Eylül 2026'da bırakıldı.** Gün gün plan öğrenciyi geciktiği için suçlu hissettiriyordu. Artık yol haritasını biz veriyoruz, sırayı öğrenci seçiyor; 24 saat girmeyene hatırlatma gidiyor. |
| Ücretsiz kullanıcıya stüdyo TTS | Cihaz sesi | Podcast maliyetin %98,4'ü; ücretsiz kullanıcı başına aylık ~108 TL |
