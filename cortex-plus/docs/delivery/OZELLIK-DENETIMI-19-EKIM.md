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

Bekçi: `feature-audit-studios.test.tsx`, `document-answer-verification.test.ts` ("looselyContains").

## Sıradaki tur

Yayından sonra aynı belgelerle: belgeyle sohbet (üç soru), Doğru/Yanlış ve sözlü belgeden, podcast
süresi, kart 20; sınav hazırlığı yolu (Farmakoloji 10 s., Coğrafya 12 s.): konu haritası, ders, yazılı
deneme, video; fotoğraftan çözüm.
