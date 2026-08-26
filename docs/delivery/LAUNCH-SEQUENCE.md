# Launch sırası (PayTR hariç)

Tek kaynak: [GREENFIELD-CONNECT.md](./GREENFIELD-CONNECT.md)

## Sıra

| # | Konu | Kod / otomasyon | Senin yapman gereken |
|---|------|-----------------|----------------------|
| 1 | Supabase env | `/api/health` → `ok: true` | **Tamam** (canlı doğrulandı) |
| 2 | www → apex | `vercel.json` + Vercel Domains redirect | **Vercel redirect ayarlı**; Squarespace’te **www CNAME** → [WWW-DNS-SQUARESPACE.md](./WWW-DNS-SQUARESPACE.md) |
| 3 | E-posta doğrulama | [AUTH-SETUP.md](./AUTH-SETUP.md) | Vercel’de `RESEND_API_KEY` var; domain/Supabase SMTP kontrol |
| 4 | Google OAuth | [GOOGLE-OAUTH.md](./GOOGLE-OAUTH.md) | **Tamam** (Supabase secret + canlı `/onboarding` testi) |
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
