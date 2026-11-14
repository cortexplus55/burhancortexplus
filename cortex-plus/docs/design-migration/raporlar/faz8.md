# Faz 8 · Stüdyo araçları (`ui.v2.studyo`)

8A, 8B ve 8C tek PR'da (hız; tek bayrak). 8.0 incelemesi aşağıda.

## 1. Özet
- **/araclar:** bayrak açıkken Plus'a özel üç stüdyonun (Podcast, Sözlü, Yazılı) kartı `<Gate>` içinde
  (`podcast.create`, `oral.start`, `written.start`). Ücretsiz hesapta kart kilit + `PLUS` rozetiyle; basınca stüdyo
  sayfası açılmaz, yükseltme penceresi açılır (Esc kapatır, odak karta döner). Plus'ta kart kapısız, bağlantı aynen.
  Kartlar kenarsız (`bg-1`, köşe 24), üzerine gelince bir basamak açık zemin.
- **Podcast:** şimdiki satır renk + kalınlık + sol çizgi, en az 16 px (renk tek başına anlam taşımıyor; konuşmacı adı
  satırda yazılı). Konuşmacı renkleri token oldu (`--cx-speaker-ada`, `--cx-speaker-kerem`; açık temada koyu ton).
  Oynatıcı düğmeleri en az 44 px, odak halkası.
- **1 dk video:** dikey çerçeve masaüstünde ortalı, en çok 405 × 720.
- **Sözlü:** mikrofon düğmesi bugün 72 px (≥ 56); yalnız odak halkası eklendi.
- Sarmalayıcı: `/araclar`, `/studio/*` (düzen), hazırlığın `video`, `podcast`, `sinav-sabahi` sayfaları (düzen) ve
  yoldaki podcast / sözlü adımı (`STUDYO_KINDS`). Bayrak kapalıyken DOM ve görünüm eskisiyle aynı.

## 2. 8.0 inceleme
| Giriş noktası | Eylem | Bugünkü koruma | Bu fazda |
|---|---|---|---|
| /araclar Podcast kartı | `podcast.create` | Sunucu: `PODCAST_GENERATE` Plus'a özel (`plus_only_action`), sayfada "Plus" rozeti | `<Gate>` (bayrak açıkken) |
| /araclar Sözlü kartı | `oral.start` | Sunucu: `ORAL_EXAM_GENERATE` Plus'a özel | `<Gate>` (bayrak açıkken) |
| /araclar Yazılı kartı | `written.start` | Sunucu: `PRACTICE_EXAM_GENERATE` Plus'a özel | `<Gate>` (bayrak açıkken) |
| /araclar Test, Kartlar, Doğru / Yanlış | (ders sayacı) | Sunucu: ücretsizde `free_lesson_limit` | Bugünkü rozet; `lesson.create` kapısı ilk ders döngüsü bağlamı olmadan yanlış pencere ("ilk ders kullanıldı") açacağı için takılmadı |
| Hazırlık sayfası video düğmesi | `video.create` | Sayfa `requireFeature` + sunucu `SKETCH_VIDEO_GENERATE` | Değişmedi (sayfa kendi kapısını çiziyor) |
| Hazırlık sayfası "Sınav sabahı kâğıdı" | `cram.export` | `plusOnlyLocked` + `PlusOnlyGate` (rozet + yükseltme) | Değişmedi: bugünkü kapı Faz 3 penceresinin eşdeğeri |
| Yoldaki podcast / sözlü adımı | (adım açılışı) | `node/start.ts` `PLUS_ONLY_NODE_KINDS` | Değişmedi |

- **Podcast:** oynatıcı oynat / duraklat, ±15 sn, hız, bölüm atlama; karaoke kelime kelime (`PodcastKaraokeLine`),
  satıra dokununca atlama var (korundu). Otomatik oynatma yok.
- **Video:** 9:16 / 16:9 çerçeve, oynatıcı birleşik (MP4 değil); logo geçişi ve bitiş kartı üretim hattı (dokunulmadı).
- **Sözlü:** sesli / sessiz mod, mikrofon izni, kayıt durumu, transkript; hoca puanı verisi ve "dinleme serisi"
  kodda yok (çizilmedi).
- **Yazılı / İkiz:** soru türleri çoktan seçmeli + açık uçlu; süre ve cevap kaydı (`exam-draft`), çıkış uyarısı var.
  "Geçen deneme" verisi yok (çizilmedi).
- **Sınav sabahı kâğıdı:** tarayıcı yazdırması (`window.print`), baskı kuralları `cram-sheet.css` içinde
  `body:has(.cp-cram-sheet)` ile. Bu fazın CSS'inde `@media print` yok (bekçi test); yazdırma düzeni değişmedi.
- **DNA, Tahmini net, İlerleme:** SVG ve CSS çizimler; bu fazda dokunulmadı (Faz 11/12'de grafik erişilebilirliği).

## 3. Değişen dosyalar
`src/components/parity/studio-gallery.tsx` (`gated`, `STUDIO_GATE_ACTION`), `src/components/parity/tools-hub.tsx`
(`gated`), `src/app/araclar/page.tsx`, `src/app/studio/layout.tsx`, `src/app/deneme-sinavlari/[prepId]/{video,podcast,sinav-sabahi}/layout.tsx`,
`src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx`, `src/styles/ui-v2-studyo.css`, `src/styles/tokens.css`
(iki konuşmacı token'ı), fikstür `/e2e/studyo?ui=v2`, testler `tests/unit/ui-v2-studyo.test.tsx`, `tests/e2e/faz8.spec.ts`.

## 6. Promptan ayrılan yerler
- 8A/8B/8C tek PR. Podcast ilerleme çubuğunun ARIA slider'a çevrilmesi, "Şimdiki satıra dön" düğmesi ve otomatik
  kaydırmanın kullanıcı kaydırınca durması yazılmadı: oynatıcının davranışını değiştirir; bugünkü oynatıcı satıra
  dokununca atlıyor ve şimdiki satırı vurguluyor. "Sonraki karar".
- Sözlüde `TimerRing`, yazılıda "optik form açılışı" ve eşik duyuruları yazılmadı: bugünkü bileşenlerin davranışı.
- Hazırlık sayfasının bağlamında `video.create` ve `cram.export` için `<Gate>` takılmadı: iki sayfa da bugün kendi Plus
  kapısını çiziyor; ikinci bir kapı aynı pencereyi iki kez açtırırdı.
- Hazırlık alt sayfalarının düzeni bayrağı kullanıcı kimliği olmadan okuyor (pilot listesi bu sayfalarda çalışmaz;
  bayrak açıldığında herkese açılır).

## 10. Burhan'ın yapacakları
- Telefonda podcast dinlerken şimdiki satırın okunurluğu.
