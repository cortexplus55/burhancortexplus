# Cortex Plus — Origin design adaptation

Cortex Plus marketing and shared UI accents follow an **Origin Financial–inspired** dark gallery system. The reference palette and component rules were adapted from the external style guide (Origin: near-black canvas, serif display, chromatic feature tiles, white-on-black primary CTA).

## Scope

| Surface | Treatment |
|---------|-----------|
| Marketing (`/`, `/ozellikler`, `/sinav-hazirligi`, auth, onboarding, kayıt) | Always dark Origin (`.origin-marketing`) |
| Logged-in app (sohbet, quiz, ayarlar, admin) | Existing shadcn **light/dark** via `next-themes`; Origin tokens used for accents |

## Files

- `cortex-plus/src/styles/origin-tokens.css` — global CSS variables (colors, type scale, motion)
- `cortex-plus/src/styles/origin-marketing.css` — marketing shell + `mk-*` utility classes
- `cortex-plus/src/lib/origin/feature-colors.ts` — feature → chromatic tile mapping
- `cortex-plus/src/components/marketing/origin-marketing.tsx` — header, hero, sections, page wrapper

Legacy: `astra-marketing.css` re-exports `origin-marketing.css`; `.astra-marketing` is a selector alias.

## Typography

- **Display:** DM Serif Display (substitute for Lyon Display 300)
- **UI:** Geist Sans
- **Labels / data:** Roboto Mono, uppercase with tracking for eyebrows

## Primary CTA

Only high-intent actions use **white fill + black text** (`mk-btn-primary` or `Button variant="origin"`). No blue/purple primary pills on marketing.

## Feature → color (full-bleed tiles only)

| Feature | Token | Hex |
|---------|-------|-----|
| AI sohbet / öğretmen | iris-gleam | `#847dff` |
| Deneme & quiz | cyan-signal | `#00b3dd` |
| Çalışma planı | deep-iris | `#4b49aa` |
| Flashcard | pale-iris | `#d1c9ff` |
| Lab / uygulamalar | periwinkle | `#90b8f0` |
| Sözlü sınav / fotoğraf | orchid-bloom | `#dd90d8` |

Do **not** use chromatic accents on body text or small UI chrome; charts/sparklines may use `--color-cyan-signal`.

## Do / Don’t (short)

- Do: surface steps (`obsidian` → `graphite` → `silver` inverted cards), 8px button radius, 30px feature tiles
- Don’t: card drop shadows, bold display serif, gradients on buttons, light body text at pure `#fff` (use `ash` / `cloud`)

## App shell

`astra-app.css` uses the same Obsidian/Graphite steps and white primary button for mobile chrome and paywall sheets.

## Checkbox (global)

All `@/components/ui/checkbox` instances use Origin `mk-checkbox` styling (`origin-controls.css`): light mode checked = black fill / white tick; dark mode and `.origin-marketing` = white fill / black tick. `DropdownMenuCheckboxItem` uses the same visual language.

## Public surfaces on Origin

- All routes using `MarketingPage` / `LegalDocument` (yardım, iletişim, KVKK, ödeme sonucu, vb.)
- Auth flows: giriş, kayıt sihirbazı, şifre sıfırlama, e-posta doğrulama, onboarding
- `not-found.tsx` and `error.tsx`
- Form primitives: `OriginInput`, `OriginLabel`, `OriginButton`, `OriginCheckbox`, `OriginConsentRow`, `OriginSelectContent` / `OriginSelectItem`, `originSelectTriggerClass`
- `SiteHeader` / `SiteFooter` (`site-chrome.tsx`) re-export Origin chrome for consistency
