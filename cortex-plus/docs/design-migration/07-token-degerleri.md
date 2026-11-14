# 07 · Depodaki gerçek token değerleri

Kaynak: `src/styles/tokens.css` (`:root` = açık tema, `.dark` = koyu tema; öğrenci uygulaması koyu temada açılır).
Üretim: `node scripts/design/token-values.mjs > docs/design-migration/data/token-degerleri.json` (tam liste: açık 173,
koyu 42 `--cx-*` değeri). Main `492e206e`, 14 Kasım 2026.

## Zemin, metin, marka, odak

| Token | Koyu tema (uygulama) | Açık tema | Prompt'taki referans | Fark |
|---|---|---|---|---|
| `--cx-bg-0` | `#0b0907` | `#ffffff` | `#0b0907` | aynı |
| `--cx-bg-1` | `#15110d` | `#f1f4f9` | `#14110f` | ayrı |
| `--cx-bg-2` | `#1e1813` | `#e6ebf2` | `#1c1815` | ayrı |
| `--cx-bg-3` | `#29211a` | `#d9e0ea` | `#27221e` | ayrı |
| `--cx-bg-4` | `#3d3229` | `#b7c2d1` | — | |
| `--cx-border` / `--cx-border-2` | `#29211a` / `#3d3229` | `#d9e0ea` / `#b7c2d1` | — | |
| `--cx-text-primary` | `#f7f1e8` | `#0b1220` | — | |
| `--cx-text-reading` | `#ede4d6` | `#1e293b` | — | |
| `--cx-text-secondary` (ikincil) | `#b9ada0` | `#475569` | `#a8a29e` | ayrı |
| `--cx-text-tertiary` (üçüncül) | `#a09384` | `#4f5b6d` | `#8a837d` | ayrı |
| `--cx-text-disabled` | `#7a6e62` | `#737e90` | — | |
| `--cx-brand` | `#6366f1` | `#6366f1` | `#6366F1` | aynı |
| `--cx-brand-strong` | `#4f46e5` | `#4f46e5` | `#4F46E5` | aynı |
| `--cx-violet` | `#8b5cf6` | `#8b5cf6` | `#8B5CF6` | aynı |
| `--cx-cyan` | `#06b6d4` | `#06b6d4` | `#06B6D4` | aynı |
| `--cx-text-brand` | `#a5b4fc` | `#4338ca` | — | |
| `--cx-brand-weak` | `#1e1b4b` | `#e0e7ff` | — | |
| `--cx-focus` (odak) | `#22d3ee` | `#0e7490` | `#22D3EE` | aynı (koyu) |
| `--cx-highlight` (Plus altını) | `#f59e0b` | `#f59e0b` | `#F59E0B` | aynı |
| `--cx-text-highlight` | `#fbbf24` | `#92400e` | `#FBBF24` | aynı (koyu) |
| `--cx-highlight-weak` | `#3a2a0a` | `#fef3c7` | — | |
| `--cx-danger` (hata kırmızısı) | `#f87171` | `#b91c1c` | — | Sigma tonlarından ayrı |
| `--cx-gradient-brand` | `radial-gradient(55% 90% at 100% 50%, #ffffff1f, #fff0 70%), linear-gradient(90deg, #4f46e5, #6366f1)` | aynı | | |
| `--cx-gradient-signature` | `linear-gradient(120deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)` | aynı | | |

Prompt'taki palet B referansıyla bg1–bg3 ve ikincil/üçüncül metin birkaç birim ayrı; kaynak sırası gereği depodaki
değerler tek kaynak (13 Kasım 2026 depo kararı 9'daki "Palet B" değerleri bunlar). Değiştirilmedi.

## Plan kimliği (`--cx-plan-*`, 14 Kasım 2026'da `cx-profile.css`'ten `tokens.css`'e taşındı)

| Token | Açık tema (`:root`) | Koyu tema (`.dark`, yalnız farklı olanlar) |
|---|---|---|
| `--cx-plan-free-ring` | `#3a332d` | |
| `--cx-plan-plus-ring` | `conic-gradient(from 200deg, #fde68a, #f59e0b, #b45309, #f59e0b, #fde68a)` | |
| `--cx-plan-sigma-ring` | `conic-gradient(from 20deg, #fca5a5, #f43f5e, #dc2626, #7f1d1d, #f43f5e, #fca5a5)` | |
| `--cx-plan-plus-mark` | `#f59e0b` | |
| `--cx-plan-sigma-mark` | `linear-gradient(135deg, #fca5a5, #ef4444)` | |
| `--cx-plan-mark-text` | `#150404` | |
| `--cx-plan-plus-tint` | `linear-gradient(135deg, #f59e0b24, #f59e0b0a)` | |
| `--cx-plan-plus-line` | `#f59e0b47` | |
| `--cx-plan-sigma-tint` | `linear-gradient(135deg, #f43f5e2e, #f43f5e0d)` | |
| `--cx-plan-sigma-tint-open` | `linear-gradient(135deg, #f43f5e47, #f43f5e1f)` | |
| `--cx-plan-sigma-line` | `#fb718559` | |
| `--cx-plan-sigma-text` | `linear-gradient(90deg, #be123c, #e11d48)` | `linear-gradient(90deg, #fda4af, #f87171)` |
| `--cx-plan-sigma-chip-bg` | `#ffe4e6` | `#3a1519` |
| `--cx-plan-sigma-chip-text` | `#9f1239` | `#fda4af` |
| `--cx-plan-sigma-glow` | `radial-gradient(90% 38% at 20% 0%, #f43f5e26, transparent 72%)` | |

## Kanıt: Kurucu ve Sigma aynı `--cx-plan-*` token'larını kullanıyor

1. **Görünüm ailesi tek:** `src/lib/student/plan-identity.ts:36` kurucuya `look: "sigma"` verir; `:40` Sigma'ya da
   `look: "sigma"`. Kapsül, halka, plan etiketi, panel, şerit ve çip sınıfları bu aileden kurulur
   (`cx-capsule--${look}`, `cx-pring--${look}`, `cx-plan-label--${look}`, `cx-pp-panel--${look}`, `cx-pp-strip--${look}`,
   `cx-pp-chip--${look}`; `src/components/parity/profile-identity.tsx`). Kurucu için ayrı bir sınıf ya da renk yok;
   yalnız etiket "Kurucu".
2. **Sigma ailesinin kuralları** (`src/styles/cx-profile.css`): `.cx-pring--sigma` → `--cx-plan-sigma-ring` (:55),
   işareti → `--cx-plan-sigma-mark` (:75), `.cx-plan-label--sigma` → `--cx-plan-sigma-text` (:106),
   `.cx-capsule--sigma` → `--cx-plan-sigma-tint` + `--cx-plan-sigma-line` (:133–134), açıkken `--cx-plan-sigma-tint-open`
   (:160), `.cx-pp-panel--sigma` → `--cx-plan-sigma-glow` (:206), `.cx-pp-chip--sigma` → `--cx-plan-sigma-chip-bg` /
   `-chip-text` (:285–286), `.cx-pp-strip--sigma` → `--cx-plan-sigma-tint` (:418).
3. **Kurucu'nun öbür yüzleri de aynı token'lar** (`src/styles/founder.css`): Kurucu çipi ve rozeti
   `--cx-plan-sigma-chip-bg` / `-chip-text` (:16–17), üzerine gelince `--cx-plan-sigma-tint-open` (:30), köşe işareti
   `--cx-plan-sigma-mark` (:50), Kullanım limitleri'ndeki kurucu kartı `--cx-plan-sigma-tint` + `--cx-plan-sigma-line`
   (:137–138), kartın halkası `--cx-plan-sigma-ring` (:150).
4. **Canlı ölçüm** (cortexplus.app, kurucu oturumu, 14 Kasım 2026): `/profil` çip zemini ve `/pay` rozet zemini
   `rgb(58, 21, 25)` = `#3a1519` = koyu temadaki `--cx-plan-sigma-chip-bg`; köşe işareti "Σ", taç simgesi yok.
5. **Bekçi:** `tests/unit/profil-kutuphane.test.tsx` ("Kurucu her yerde Sigma görünümünde…": founder.css'te altın yok,
   çip ve kart Sigma token'larında; `--cx-plan-sigma-chip-bg` tokens.css'te iki kez, cx-profile.css'te hiç tanım yok).
