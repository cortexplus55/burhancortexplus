# Desen haritası · Tekrar ekranları (`ui.v2.tekrar`)

Konu testi (`quiz`), Doğru / Yanlış (`true_false`), Akıllı kartlar (`flashcards`, `spaced`). Kurallar
`src/styles/ui-v2-tekrar.css`, yalnız `[data-ui~="tekrar"]` altında; sayfa (`dugum/[nodeId]/page.tsx`) bayrak açıkken
sarmalar. Tekrar ekranlarının içine `Gate` konmadı (ilk dersin ekranları ücretsizde açık).

| Mevcut öğe | Hedef |
|---|---|
| `.cp-back-pill` ("Etkinliği kapat") | `glass` ikon düğmesi 40 px (telefonda 44); onay davranışı aynen |
| Şık düğmesi (`exam-quiz-play.tsx`, kanca `data-cx-option`) | `AnswerOption`: hap ≥ 56 px; Boşta `bg1`, Hover / Seçili `bg2`, Doğru `success-weak`, Yanlış `danger-weak`, Kaçırılan doğru `bg0` + yeşil ✓ |
| Harf rozeti (kanca `data-cx-letter`) | 40 px yuvarlak, mono; harf `options.length`'ten (4 şıklıda "E" yok) |
| `.cp-exam-continue--primary` | Tek brand hap 52 px |
| `.cp-exam-continue` (öbürleri) | `weak` hap |
| `.cp-two-chip` ("🤔 İki şık arasında kaldım") | HER ZAMAN `weak` |
| `.cp-quiz-why` (şık nedeni) | `bg1` kutu, köşe 16, kendi içinde yatay kaydırma |
| `.tf-focus-card` | Kenarlıksız kart, `bg1`, köşe 32 |
| `.tf-focus-choices > button` | Hap ≥ 56 px |
| `.tf-focus-next` | Brand hap |
| `.cp-exam-flash-side` (kart yüzü) | Kenarlıksız, `bg1`, köşe 32 |
| `.cp-exam-card-rate` ("Bildim" / "Tekrar") | Hap ≥ 52 px; ana eylem mevcut sınıfla |

## Desen yok / Sonraki karar

| Öğe | Neden |
|---|---|
| Hedef şeridi (`LaneProgress tone:'target'`) | Aynı konunun önceki sonucu istemciye gelmiyor (yeni veri alanı yasak) |
| `ComboChip` seri | Ekranda zaten canlı seri rozeti var (`coach-chrome.tsx`, 7 Kasım); ikinci gösterge eklenmedi |
| `TimerRing` | Konu testinde ve D/Y'de bugün soru başına süre sınırı yok |
| `LaunchSequence` | "Sorular hazırlanıyor" sırasında gerçek ilerleme verisi yok: durağan bekleme ekranı korunur |
| `ResultReveal`, `SquareStrip` sonuç | Sonuç ekranı ortak (`exam-node/result.tsx`); Faz 9/10 ile birlikte bağlanacak |
| Kart çevirme 220 ms, yelpaze açılışı | Mevcut 3B dönüş (`parity-shell.css`) korunur; davranış ekler |
