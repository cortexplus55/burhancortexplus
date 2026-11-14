# 08 · Heyecan kiti (`components/arena`)

Faz 4A, 14 Kasım 2026. Görünür değişiklik yok: hiçbir ekran çağırmaz (bekçi: `tests/unit/heyecan-kiti.test.tsx`).
Doğrulama galerisi `/arena` (`src/app/(dev)/arena`); üretimde `VERCEL_ENV === "production"` iken 404.

"Heyecan kiti matrisi" tahtası depoda yok (`tahtalar/` boş); eşleme ANA-PROMPT 4A tablosundan.

| Matris satırı (ANA-PROMPT) | Bileşen | Kullanacak faz |
|---|---|---|
| Şeritli ilerleme (sen / bot / arkadaş / hedef) | `LaneProgress` | 4B (hedef adım şeridi, tek şerit), 9A düello |
| Süre | `TimerRing` | 9A düello turu |
| Seri | `ComboChip` | 4B hızlı sınav, 5A konu testi, 9A |
| Açılış (hazırlık → hazır → 3-2-1) | `LaunchSequence` | 9A (VS / geri sayım) |
| Sonuç sayacı | `ResultReveal` | 5A, 9A sonuç |
| Kare dizisi | `SquareStrip` | 5A sonuç, 9A, 10A kart |
| Paylaş | `ShareSheet` (yalnız kabuk) | 10A |
| Ses / titreşim tercihi | `useFeedbackPrefs` (varsayılan KAPALI, ses dosyası yok) | — |

## Sözleşmeler

| Bileşen | Sözleşme |
|---|---|
| `LaneProgress` | `lanes: Lane[]`, `single?`. `tone: "bot"` ise `badge: "BOT"` tip düzeyinde zorunlu (`@ts-expect-error` testi). `role="img"` + tek özet ("Sen 6, Atlas 5"). |
| `TimerRing` | `total`, `remaining`, `warnAt = 5`. `role="timer"`, `aria-live="off"`; yalnız 10 ve 5 sn eşiğinde bir kez duyurur. Son `warnAt` sn 1 sn'lik nabız (ölçek ≤ %3); hareket azaltmada yalnız renk + sayı. |
| `ComboChip` | `combo ≥ 2` → "×2"; 220 ms ölçek girişi; `aria-live="polite"` "2 seri". |
| `LaunchSequence` | `phase`, `slots`, `progress` (gerçek, dışarıdan), `onDone`, `onSkip`. Sahte bekleme yok; 3-2-1 yalnız `countdown`'da; "Atla" yalnız `ready`; hareket azaltmada düz adımlar, `onDone` hemen. |
| `ResultReveal` | `from`, `value`, `duration ≤ 1000`, `format`; hareket azaltmada doğrudan son değer; ekran okuyucu yalnız son değeri okur. |
| `SquareStrip` | `items: { state }[]`; şekil + glif (✓ ✕ – ×2); özet "7 doğru, 3 yanlış" (boş varsa "N boş"). |
| `ShareSheet` | `formats`, `getFiles(format, { showName, showQuestion })`, `url`; ad ve soru varsayılan KAPALI; `navigator.canShare({ files })` yoksa indirme; bağlantı kopyalama. |

## Token'lar (eklendi)

`--cx-lane-you`, `--cx-lane-bot`, `--cx-lane-friend` (`src/styles/tokens.css`). Koyu tema ANA-PROMPT değerleri
(`#22d3ee`, `#e879f9`, `#a78bfa`); açık temada beyaz zeminde okunur koyu tonlar (`#0e7490`, `#a21caf`, `#6d28d9`).

## Tahtada olmayan metinler

Paylaşım kabuğunun düğme adları ("Hikâye", "Kare", "Bağlantı", "Kopyalandı", "Adımı göster") ve süre duyurusu
("N saniye kaldı") tahta gelmeden yazıldı; Faz 10'da tahtayla değişebilir ("Sonraki karar").
