# Desen haritası · Öğretmen / sohbet (`ui.v2.ogretmen`)

`/ogretmen` bayrak açıkken `<div class="cx-ui-scope" data-ui="ogretmen">` ile sarılır; kurallar
`src/styles/ui-v2-ogretmen.css`. Faz 3'ün ana ekran gövdesi (halka, şerit, ince çubuk, üst çubuk, hak göstergesi)
dokunulmadı. Davranış eki bayrağa bağlı `ChatPanel followUser`.

| Mevcut öğe | Hedef |
|---|---|
| `.cp-sor-messages` sütunu | Blok ≤ 768 px ortalı |
| `.cp-sor-msg-user` | Kenarlıksız balon, `bg2`, köşe 24 |
| `.cp-sor-msg-assistant` | Kenarlıksız satır; uzun URL `overflow-wrap:anywhere`; blok formül ve kod kendi içinde kayar |
| `.cp-tutor-mode-pill` (Sokratik / Adım adım / Doğrudan çöz) | `Segmented` hap 40 px (telefonda 44), `aria-checked` mevcut |
| `.cp-send` | Tek brand, yuvarlak 44 px, `aria-label="Gönder"` mevcut |
| Akış sırasında sona çekme | `followUser`: yalnız yeni mesaj eklenince; öğrenci yukarıdaysa "Yeni mesaja git" (`glass`, sağ alt) |
| `role="log" aria-live="polite"` (parça parça okunuyordu) | Liste `aria-live="off"`; yanıt bitince tek duyuru "Öğretmen yanıtladı" |

## Desen yok / Sonraki karar

| Öğe | Neden |
|---|---|
| Hazırlık sohbeti (`/deneme-sinavlari/:id/sohbet`, `examChrome`) | Ayrı kabuk; bu PR yalnız `/ogretmen` |
| Hata satırı + "Yeniden dene" | Bugün "Tekrar sor" (`regenerateLast`) ve hata balonu var; davranış aynen |
| Anlama göstergesi, oturum özeti, "güzel açıklamayı kart yap" | Bugün yok (yeni yapay zekâ çağrısı yasak) |
