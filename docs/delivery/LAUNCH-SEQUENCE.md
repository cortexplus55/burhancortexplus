# Launch sırası (PayTR hariç)

Tek kaynak: [GREENFIELD-CONNECT.md](./GREENFIELD-CONNECT.md) · **Teslim özeti:** [TESLIM.md](./TESLIM.md)

## Sıra

| # | Konu | Kod / otomasyon | Senin yapman gereken |
|---|------|-----------------|----------------------|
| 1 | Supabase env | `/api/health` → `ok: true` | **Tamam** (canlı doğrulandı) |
| 2 | www → apex | `vercel.json` + Vercel Domains redirect | **Vercel redirect ayarlı**; Squarespace CNAME → [DNS-CORTEXPLUS-APP.md](./DNS-CORTEXPLUS-APP.md) |
| 3 | E-posta doğrulama | [EMAIL-SIGNUP-FIX.md](./EMAIL-SIGNUP-FIX.md) | Prod kayıt **açık**; kalıcı mail: Resend DNS + Supabase SMTP |
| 4 | Google OAuth | [GOOGLE-OAUTH.md](./GOOGLE-OAUTH.md) | **Tamam** (GCP Branding + canlı consent **Cortex Plus**) |
| 5 | Kayıt uçtan uca | kayıt → `/kayit/tamamla` | **Tamam** (Confirm email kapalıyken prod doğrulandı) |
| 6 | Onboarding | signup-wizard stilleri | — |
| 7 | App içi tema | `astra-app` altın | — |
| 8 | Admin shell | `admin-shell` CSS | — |
| 9 | PWA | `manifest.ts` theme | — |
| 10 | SEO | `sitemap.ts`, `robots.ts` | GSC: `GOOGLE_SITE_VERIFICATION` env + mülk ekle |
| 11 | Sosyal kanıt | örnek etiketi | — |
| 12 | CI + RLS | `.github/workflows/ci.yml` (lokal) | Push: [GITHUB-CI-WORKFLOW-SCOPE.md](./GITHUB-CI-WORKFLOW-SCOPE.md); migration’lar Supabase’te uygulu |

**PayTR:** bilinçli olarak bu listede yok; ödeme hazır olunca ayrı faz.

## Hızlı doğrulama

```bash
curl -s https://cortexplus.app/api/health | jq
```

`ok: false` ise Vercel env hâlâ eski projeye (`gwqonggqzvavljguiryx`) bakıyor olabilir.
