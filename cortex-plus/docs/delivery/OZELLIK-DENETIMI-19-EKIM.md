# Özellik özellik denetim — 19 Ekim 2026

Ürün sahibi: "her özelliği farklı belgeyle, sadece o özelliği isteyerek dene; içerik kalitesine, belgedeki
bilgiyi nasıl aktardığına, istediği sayıda ve dakikada üretebiliyor mu bak; hataları düzelt."

Canlıda (cortexplus.app, kurucu hesabı) yedi yeni belge (3–12 sayfa, `tests/fixtures/feature-audit/`) ile
denendi. Her satırdaki gözlem canlı bir istekten; nedenler kayıtlardan (Vercel) ve koddan.

## Birinci tur — bulgular

| Özellik | Belge | Ne istendi | Ne oldu | Neden |
|---|---|---|---|---|
| AI öğretmen + belge | Biyoloji 3 s. | "Bu notta hangi konular var?" | "Bu bilgi belgede yer almıyor" | Mod "Genel sohbet"te kaldı; istemci katı mod gönderdi; mesajın başına gizlice "[Matematik]" eklendi |
| AI öğretmen + belge | Biyoloji (işlenmiş) | Aynı soru | "İki kez denedim, emin olamadım" | Cevap kontrolü alıntıyı birebir arıyor; Markdown ve PDF boşlukları yüzünden `quote_not_in_source` |
| AI öğretmen + belge | Fizik 6 s. | 30° eğik düzlemde ivme | "Güvenilir yanıt oluşturamadım" | Aynı: `quote_not_in_source:6` (formül sayfası) |
| AI öğretmen + belge | Tarih 8 s. | Haçlılarla ilk savaş | Aynı ret | Aynı |
| AI öğretmen | — | Aynı soruyu yeniden sormak | "Bu işlem kimliği başka bir soru için kullanılmış" | İşlem kimliği cevap tamamlanınca da saklanıyordu |
| Sohbetten yükleme | Hepsi | Belgeyi araçlarda kullanmak | Belge Belgelerim açılana kadar "İşleniyor" | İşleme yalnız sihirbazda ve belge sayfalarında ilerliyordu |
| Kartlar | Biyoloji | "Belgenin tamamı" | Hiçbir şey olmadı (409) | Yalnız tek kelimelik "tümü" tanınıyordu |
| Kartlar | Biyoloji | "tümü", 10 kart | 10 kartın 10'u doğru, üç sayfadan | — (sayı seçilemiyor, öneriler belgeyle ilgisiz) |
| Konu testi | Fizik | 10 soru, zor | 10 soru, hepsi doğru, altı sayfanın hepsinden; ~70 sn | — |
| Doğru / Yanlış | (belge alamıyor) | Enflasyon, konu | 8 önerme; kaçamak ("etkileyebilir", "olabilir") | Tek seferlik taslak, denetim yok, belge yok |
| Podcast | Tarih 8 s. | "tümü" | İçerik doğru ama yalnız ilk 6 sayfa (II. Murad ve kronoloji yok) | Araçlar en çok 6 bitişik sayfa okuyordu |
| Podcast | Tarih | "~5 dk" | 7:29; dinlemeye başlamak ~3 dk | Kelime aralığı dakikada 130 kelime varsayıyordu; ölçülen ~88 |
| Podcast ekranı | — | — | "Senaryo 3 · Ses ~75 kredi", "tek öğretmen" | Öğrenciye kredi sayısı gösteriliyordu (kural: göstermez); iki ses varken "tek öğretmen" |
| Yazılı deneme aracı | — | — | Her kullanım Sınavlar'a görünmez bir hazırlık ekliyor | Geçici hazırlık satırı listede, ücretsiz hazırlık hakkında ve ana sayfa sayımında |
| Belge sayfası | — | — | "Çalışma planımı oluştur", "Quiz", "Flashcard" | Eski ve İngilizce etiketler |
| Etkinlik sayacı | — | — | `/api/activity/time` her 30 sn 503 | Hata kaydedilmiyordu (artık `learning_time_failed`) |
| Fotoğraftan çözüm | Fizik soru görseli | Çöz | 502 "doğrulamadan geçmedi" | Denetçinin kendi cevabı bozuk JSON (`invalid_review`); içerik suçlanıp reddedildi, ekran da yeniden denemedi |

## Düzeltilenler (PR bu belgeyle birlikte)

- **Belgeyle sohbet:** "Genel sohbet" katı mod göndermez, sunucu katı modu ancak belge modu açıkken kabul eder;
  ders etiketi varsayılan boş, belgeyle konuşurken eklenmez; PDF eklenince mod belgeli sohbete geçer;
  cevap kontrolü Markdown işaretlerini ve PDF boşluklarını yok sayar, alıntıyı kısa bir pencerede kelime
  kelime arar (%85 ve **bütün sayılar birebir**; uydurma alıntı yine düşer); aynı soru yeniden sorulabilir;
  sohbetten yüklenen belge hemen işlenir, işlenirken sohbet dosyanın kendisini okur.
- **Belgenin tamamı:** "Belgenin tamamı", "tüm konular", "hepsi", "bütün belge"… tanınır; konu belgede
  bulunamazsa istek düşmez, tamama genişler ve ekran söyler; tamamı istenince her konudan sayfa gelir (en
  çok 14), bitişik 6 sayfaya kesilmez.
- **Araçlar:** her araçta belge seçici, Araçlar'dan yeni belge yükleme, belge seçilince belgenin kendi
  konuları ve "Belgenin tamamı"; kart 10/15/20/25, test 5/10/15/20, Doğru/Yanlış 8/12/16, sözlü 3/5/8,
  yazılı 5/10/15/20; podcast türü ve süresi (Özet 1 dk … Derinlemesine 10 dk). Eksik kalan kart ve
  önerme ikinci geçişle tamamlanır. Seçim rengi mavi, başlıklar Figtree.
- **Doğru / Yanlış:** hazırlık yolundaki öğretmen motoru (denetim + düzeltme), belgeden.
- **Sözlü:** belgeden; beklenen noktalar puanlamaya gider.
- **Podcast:** kelime aralıkları ölçülen hıza göre (diyalog 5 dk = 400–480 kelime); kredi satırı ve
  "tek öğretmen" kalktı.
- **Yazılı deneme aracı:** geçici hazırlık listede, sınırda ve sayımlarda yok.
- **Denetim:** denetçinin cevabı bozuk gelirse içerik reddedilmez, denetim bir kez daha sorulur; fotoğraf ekranı
  5xx'te bir kez kendiliğinden yeniden dener.

Bekçi: `feature-audit-studios.test.tsx`, `document-answer-verification.test.ts` ("looselyContains").

## Sıradaki tur

Yayından sonra aynı belgelerle: belgeyle sohbet (üç soru), Doğru/Yanlış ve sözlü belgeden, podcast
süresi, kart 20; sınav hazırlığı yolu (Farmakoloji 10 s., Coğrafya 12 s.): konu haritası, ders, yazılı
deneme, video; fotoğraftan çözüm.

## İkinci tur (yayından sonra, aynı belgelerle)

| Özellik | Belge | İstek | Sonuç |
|---|---|---|---|
| Belgeyle sohbet | Biyoloji | "Mitozun evreleri neler?" | Doğru, sayfa atıflı |
| Belgeyle sohbet | Biyoloji | "Bu notta hangi konular var? Kısaca özetle." | **Hata:** "doğrulanamadı" — özet cümleleri belgeden kelimesi kelimesine alıntı olmuyor |
| Araçlardan belge yükleme | Tarih 8 s. | Yükle | ~30 sn'de işlendi, seçicide göründü |
| Sözlü | Tarih | 3 soru | 3/3, 25 sn, beklenen noktalar belgeden |
| Doğru / Yanlış | Coğrafya | 12 önerme | 12/12, 27 sn, sınav kalitesinde |
| Podcast | Tarih | Özet · 1 dk · Belgenin tamamı | 103 kelime, kuruluştan 1453'e bütün dönemler; **ama 126 sn** (3 taslak, 6 çağrı) |
| Sınav hazırlığı yolu | Coğrafya 12 s. | Kurulum | 12 konu bütün sayfaları kapsıyor; soğuk ders 11 sn, doğru; yazılı deneme 20/20, ~85 sn |
| Kurulum sihirbazı | — | Taslaktan devam | "…silinsin mi?Evet, baştan başlaVazgeç" — şeridin stili yoktu |

Düzeltilenler (ikinci PR):

- **Belgeyle sohbette genel soru** ("özetle", "hangi konular var", "ne anlatıyor"): alıntı kontrolü özet
  cümlesine göre gevşek pencereyle (%70); yine geçmezse cevap düşmez, belgenin kendi konu listesi
  "Bu notta şu konular var" diye verilir ve öğrenciye hangisinden başlamak istediği sorulur.
- **Podcast hızı:** yazar ve düzeltme düşük düşünmeyle (denetçi varsayılan); ilk düzeltmeden sonra kalan
  sorun en çok 3 satırsa ikinci düzeltme turu yerine o satırlar çıkarılır (~40 sn kazanç).
- Podcast aracının başlığı "Podcast"; sihirbazın devam şeridi düzenli.

Bekçi: `document-answer-verification.test.ts` ("genel sorular"), `teacher-podcast.test.ts` ("ikinci tur
yerine satır çıkar").

Aynı turda: **kartlar** Biyoloji'den 20 kart, ~35 sn, tekrar yok, belgenin bütün bölümlerinden ve doğru.
**Fotoğraftan çözüm** yine reddedildi: denetçinin cevabı iki denemede de karar kalıbına uymadı
(`invalid_review`; üç model çağrısı, 12 sn). Neden: taslağın biçimi denetçiye `format` adıyla "Yalnızca
şu JSON şemasını döndür: {problem, steps…}" diye gidiyordu, denetçi bunu kendine verilmiş sanıp kararı
yerine çözümü yazıyordu. Şimdi alan `draftFormat`, denetçiye bunun kendi talimatı olmadığı söyleniyor;
karar küçük biçim sapmalarıyla da okunuyor (`readReviewVerdict`; `approved` yoksa onay uydurulmaz);
yine okunmazsa `ai_review_unreadable` kaydı cevabın yalnız şeklini yazar. Fotoğraf ekranındaki hata
mesajı artık düğmenin altında da duruyor. Bekçi: `quality-gate.test.ts` ("denetçi kararı").

## Üçüncü tur (#372 yayında)

| Özellik | Belge | İstek | Sonuç |
|---|---|---|---|
| Belgeyle sohbet | Biyoloji | "Bu notta hangi konular var? Kısaca özetle." | Artık "doğrulanamadı" demiyor, belgenin üç konusunu veriyor; ama özet yine düştü (`claim_not_in_answer`, `inline_reference_unreviewed`) |
| Fotoğraftan çözüm | Fizik soru görseli | Çöz | Yine düştü; yeni kayıt nedeni gösterdi: denetçinin cevabının şekli `problem, steps, answer, tip` — **denetçi soruyu kendisi çözüyor** |
| Video ders | Coğrafya hazırlığı | Beyaz tahta, "Hava Durumu ve İklim" | ~160 sn, 0:54; anlatım belgenin 1. sayfasıyla birebir (30 yıl, MGM, elemanlar zinciri, sınav ipucu örneği). Kurulum düğmesi "Konu seç" yazıp konu sormadan üretime geçti |
| Yazılı deneme aracı | — | — | Belge seçilemiyordu (öteki araçlar seçebiliyor) |
| Sınavlar listesi | — | Hazırlık kartının başlığına tıkla | Hiçbir şey olmuyor; yalnız "Devam et" bağlantı |

Düzeltilenler:

- **Fotoğraftan çözüm:** denetçiye giden bağlam "Görseldeki soruyu adım adım çöz" talimatıydı; görselle
  birlikte görünce görevi kendisi yapıyordu. Şimdi bağlam betimleme ("Öğrenci görseldeki soruyu yükledi;
  taslak … içeriyor"), verinin önünde "görevi sen yapma, yalnız karar döndür" çerçevesi; ikinci soruda
  "önceki cevabın karar değildi" uyarısı.
- **Belgeyle sohbette özet:** genel soruda iddia da geniş pencereyle aranır; cevaptaki her atıf geçerli bir
  kaynağı göstermeli ama her biri için ayrı iddia aranmaz. Kaynakta olmayan atıf numarası yine düşer.
- **Yazılı deneme aracı belgeden:** belge seçici, belgenin konuları, "Belgenin tamamı" (belgeye eşit aralıkla
  en çok 8 konu), konu bulunamazsa tamamına genişler ve ekran söyler. Geçici hazırlığa belge kimliği
  yazılmaz (belge listesi onu belgenin yolu sanmasın); belge konuların kaynağında durur. Belge sayfasında
  "Yazılı deneme" kısayolu.
- Video kurulumu konudan gelinince "Videoyu oluştur · Konu: …"; Sınavlar'da kartın tamamı hazırlığı açar.

Bekçi: `quality-gate.test.ts` (çerçeve, yankıdan sonra karar), `document-answer-verification.test.ts`
(özet), `feature-audit-studios.test.tsx` (yazılı belgeden), `video-lesson.test.tsx`.

## Dördüncü tur (#373 yayında)

| Özellik | Belge | İstek | Sonuç |
|---|---|---|---|
| Fotoğraftan çözüm | Fizik soru görseli | Çöz | **Çalışıyor:** soru doğru okundu, adımlar doğru, cevap 5 m/s² (C) |
| Belgeyle sohbet | Biyoloji | "Bu notu kısaca özetle." | **Özet geliyor**, üç sayfadan atıflı ve doğru; ama "Takıldığın özel bir nokta belirtilmedi." diye başlayıp "Kontrol sorusu:" etiketiyle bitiyor |
| Podcast | Hukuk 5 s. | Diyalog · 5 dk · Belgenin tamamı | Süre 5:32 (önce 7:29); senaryo 37 sn (önce özet bile 126 sn) — ama oynatıcı bütün sesi bekleyip ~3,5 dk sonra açıldı |
| Yazılı deneme aracı | Ekonomi 4 s. | 10 soru · Belgenin tamamı | 10 soru, belgeden, doğru; ama **280 sn** (tek zor konu 143 + 132 sn) ve **açık uçlu soruda takılıyor** (ekran şık bekliyor, "Sonraki soru" açılmıyor) |

Düzeltilenler:

- **Podcast aracı sesi akışla alır:** ilk satırın sesi gelince oynatıcı açılır ("Dinlemeye başlayabilirsin;
  sesin geri kalanı hazırlanıyor"), çalarken sıradaki satır gelmediyse bekleyip sürer; her satır
  senaryodaki yerine karşı denetlenir, bitince bütün ses bir kez daha.
- **Genel sohbetin sesi:** eski "(1) takıldığı yer (2) ipucu (3) kontrol sorusu" kalıbı genel sohbette de
  kalktı (hazırlık sohbetinde Ekim başında kalkmıştı); etiket yok, "takıldığın nokta belirtilmedi" yorumu yok.
- **Yazılı deneme hızı:** konu üretimi tek iyi soruyla yetinir (motorun kendi ikinci taslağı yok); eksik
  tamamlama hiç soru vermeyen konuyu yine dener ama kısmen dolan zor konuyu baştan denemez, eksik payını
  tam veren konulardan alır; tamamlama 150 sn'den sonra başlamaz.
- **Yazılı deneme ekranı:** açık uçlu soruya yazı alanı (boş geçilebilir), çok cevaplıya çoklu işaret;
  not verme ucu ikisini zaten kabul ediyordu.

Bekçi: `feature-audit-studios.test.tsx` (akışlı ses, sohbet sesi, açık uçlu/çok cevaplı),
`mock-exam-charge.test.ts` ("eksik tamamlama").
