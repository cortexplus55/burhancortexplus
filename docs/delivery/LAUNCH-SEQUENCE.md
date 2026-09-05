# Launch sırası (PayTR hariç)

Tek kaynak: [GREENFIELD-CONNECT.md](./GREENFIELD-CONNECT.md) · **Teslim özeti:** [TESLIM.md](./TESLIM.md) · **Sende kalanlar:** [SENIN-YAPACAKLARIN.md](./SENIN-YAPACAKLARIN.md)

## Sıra

| # | Konu | Kod / otomasyon | Senin yapman gereken |
|---|------|-----------------|----------------------|
| 1 | Supabase env | `/api/health` → `ok: true` | **Tamam** (canlı doğrulandı) |
| 2 | www → apex | `vercel.json` + Vercel Domains redirect | **Tamam** — `www.cortexplus.app` → 308 → `cortexplus.app` (2026-09-04 ölçüldü) |
| 3 | E-posta doğrulama | [WORKSPACE-EMAIL.md](./WORKSPACE-EMAIL.md) | **Tamam** (2026-09-04 panelden doğrulandı: Supabase SMTP açık, Confirm email açık, `SMTP_VERIFY_OK`) |
| 4 | Google OAuth | [GOOGLE-OAUTH.md](./GOOGLE-OAUTH.md) | **Tamam** — 2026-09-05: uygulama `Testing`'den çıkarılıp **In production**'a alındı; doğrulama gerekmediği için anında etkili. Zincirin tamamı (kod → Supabase → Google → geri dönüş) doğrulandı. |
| 5 | Kayıt uçtan uca | kayıt → `/email-dogrula` veya `/kayit/tamamla` | **Kalan tek adım** — gerçek adresle bir kayıt; ajan hesap açamaz |
| 6 | Onboarding | signup-wizard stilleri | — |
| 7 | App içi tema | `astra-app` altın | — |
| 8 | Admin shell | `admin-shell` CSS | — |
| 9 | PWA | `manifest.ts` theme | — |
| 10 | SEO | `sitemap.ts`, `robots.ts` | **Tamam** — 2026-09-05: Search Console mülkü açıldı, sahiplik Workspace üzerinden otomatik doğrulandı (`GOOGLE_SITE_VERIFICATION` gerekmedi), site haritası okundu (14 sayfa) |
| 11 | Sosyal kanıt | örnek etiketi | — |
| 12 | CI + RLS | `.github/workflows/ci.yml` (lokal) | Push: [GITHUB-CI-WORKFLOW-SCOPE.md](./GITHUB-CI-WORKFLOW-SCOPE.md); migration’lar Supabase’te uygulu |

**PayTR:** bilinçli olarak bu listede yok; ödeme hazır olunca ayrı faz.

## Hızlı doğrulama

```bash
curl -s https://cortexplus.app/api/health | jq
```

`ok: false` ise Vercel env hâlâ eski projeye (`gwqonggqzvavljguiryx`) bakıyor olabilir.
