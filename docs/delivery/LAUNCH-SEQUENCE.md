# Launch sırası (PayTR hariç)

Tek kaynak: [GREENFIELD-CONNECT.md](./GREENFIELD-CONNECT.md)

## Sıra

| # | Konu | Kod / otomasyon | Senin yapman gereken |
|---|------|-----------------|----------------------|
| 1 | Supabase env | `/api/health` → `ok: true`, `supabaseProjectRef: dgjfyewgrukglsehyntc` | Vercel **burhancortexplus-app** env güncelle + redeploy |
| 2 | www → apex | `cortex-plus/vercel.json` | Registrar’da **www** CNAME → Vercel (Dashboard’daki değer) |
| 3 | E-posta doğrulama | [AUTH-SETUP.md](./AUTH-SETUP.md) | Supabase Auth URLs + Resend `RESEND_API_KEY`, `EMAIL_FROM` |
| 4 | Google OAuth | [AUTH-SETUP.md](./AUTH-SETUP.md), [GOOGLE-OAUTH.md](./GOOGLE-OAUTH.md) | Google Cloud OAuth client + Supabase provider |
| 5 | Kayıt uçtan uca | `?prompt=` / `?ders=` kayıt | Deploy sonrası test: kayıt → mail → `/kayit/tamamla` |
| 6 | Onboarding | signup-wizard stilleri | — |
| 7 | App içi tema | `astra-app` altın | — |
| 8 | Admin shell | `admin-shell` CSS | — |
| 9 | PWA | `manifest.ts` theme | — |
| 10 | SEO | `sitemap.ts`, `robots.ts` | GSC property ekle |
| 11 | Sosyal kanıt | örnek etiketi | — |
| 12 | CI + RLS | GitHub Actions, migration | `supabase db push` / MCP apply |

**PayTR:** bilinçli olarak bu listede yok; ödeme hazır olunca ayrı faz.

## Hızlı doğrulama

```bash
curl -s https://cortexplus.app/api/health | jq
```

`ok: false` ise Vercel env hâlâ eski projeye (`gwqonggqzvavljguiryx`) bakıyor olabilir.
