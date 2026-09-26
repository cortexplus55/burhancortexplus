# Cortex Plus tasarım sistemi

Tek kaynak: `src/styles/tokens.css` (`--c-*`).

## Renk rolleri

| Rol | Ne zaman |
|-----|----------|
| `--c-action` | Birincil butonlar: Devam et, Bitir, Sınavı bitir |
| `--c-brand` | Logo, kurucu çipi, tanım kenarı, Hazırsın / %100 parlama, kicker |
| `--c-ai` | Yapay zekâ göstergeleri (avatar halkası, AI etiketi) |
| `--c-success` / `--c-danger` | Doğru / yanlış geri bildirim |
| `--c-surface-*` | Kart ve panel zeminleri |

Birincil eylem **asla** altın değildir. Mor gradyan kullanılmaz.

## Yazı

- Başlık: `--font-display` (DM Serif Display)
- Gövde: `--font-ui` (Figtree)
- Cümle düzeni: "Sınavı bitir", Title Case değil

## Bileşenler

`src/components/ui/` — Button, IconButton, Chip/Badge, Card, OptionCard (A–D), ProgressBar / ProgressSegments / ProgressRing, TimerPill, Orb, StickyActionBar, ErrorState, StatCard, SourceChip, SegmentedControl, Switch, Radio.

Galeri: `/tasarim` (yalnız yönetici; diğerleri 404).

## Hareket

Süreler: `--dur-fast` 150ms, `--dur-base` 260ms, `--dur-count` 600ms. `prefers-reduced-motion` altında dönüşümler kapanır.
