# Cortex Plus — teslim özeti

**Canlı site:** https://cortexplus.app  
**Supabase:** `dgjfyewgrukglsehyntc`  
**Vercel:** team `cortexplus55`, proje `burhancortexplus-app`  
**GitHub:** https://github.com/cortexplus55/burhancortexplus (`main` = production kaynağı)

PayTR bu teslimde **dahil değil** (istek üzerine ayrı faz).

---

## Tamamlandı (doğrulandı)

| Konu | Kanıt |
|------|--------|
| Canlı ortam + Supabase | `GET /api/health` → `"ok":true`, `"supabaseProjectRef":"dgjfyewgrukglsehyntc"` |
| Kayıt / giriş (e-posta) | Kod: Confirm açıkken `/email-dogrula` → link → `/kayit/tamamla` — [WORKSPACE-EMAIL.md](./WORKSPACE-EMAIL.md) |
| Post-login uygulama | `/ogretmen`, AppShell |
| Google OAuth marka | GCP Branding kayıtlı; consent **Cortex Plus** — [GOOGLE-OAUTH.md](./GOOGLE-OAUTH.md) |
| Supabase Google provider | Açık, Client ID + callback doğru |
| PWA ikonları | `/icon/192`, `/icon/512` (manifest) |
| Auth redirect | Site URL `https://cortexplus.app`, redirect listesi |
| Vercel env | Workspace `SMTP_*` + `EMAIL_FROM`; **Resend kullanılmıyor** |
| SEO | `/robots.txt`, `/sitemap.xml` canlı |
| Veritabanı | Migration’lar Supabase’te |
| GitHub CI | `.github/workflows/ci.yml` — `main`’de |
| DNS runbook | www CNAME — [DNS-CORTEXPLUS-APP.md](./DNS-CORTEXPLUS-APP.md) |

**Hızlı test:** https://cortexplus.app/kayit · https://cortexplus.app/giris → **Google ile devam et**

---

## E-posta (Workspace SMTP) — ✅ kapandı (2026-09-04)

Tek kaynak: **[WORKSPACE-EMAIL.md](./WORKSPACE-EMAIL.md)** — doğrulama tablosu orada.

| # | Adım | Durum |
|---|------|-------|
| 1 | Google uygulama şifresi | **Tamam** — `SMTP_VERIFY_OK`, Gmail'e canlı bağlandı |
| 2 | Vercel env | **Tamam** — `SMTP_PASS` + `EMAIL_FROM` var, `RESEND_API_KEY` yok. `SMTP_HOST/PORT/USER` gerekmiyor (kodda varsayılan) |
| 3 | Supabase custom SMTP | **Tamam** — açık, Gmail 587, `cortexplus@cortexplus.app` |
| 4 | **Confirm email** | **Tamam** — açık |
| 5 | Kayıt smoke | **Kalan tek adım** — aşağıya bak |

Kayıt/doğrulama e-postaları **Supabase'in kendi SMTP'sinden** gidiyor. Auth
kayıtlarında son 24 saatte tek hata/uyarı yok; 07:23'teki gerçek `/recover`
e-postası sorunsuz tamamlanmış — yani zincir çalışıyor.

**Elle yapılacak son iki teyit** (ajan yapamaz: biri giriş, diğeri hesap açmak ister)

1. `/admin/sistem` → **Workspace SMTP bağlantısını test et** — Vercel'deki
   `SMTP_PASS` kopyasını sınar. (Yerel kopya doğrulandı, Vercel'inki gizli
   olduğu için okunamıyor; ikisi 28 Ağu / 3 Eyl tarihli.)
2. `/kayit` → gerçek bir adresle kayıt → gelen kutusunda **Confirm** linki.

Geçici mod (Confirm kapalı): [EMAIL-SIGNUP-FIX.md](./EMAIL-SIGNUP-FIX.md) — artık hedeflenmez.

---

## DNS (Squarespace) — www

Vercel redirect hazır; Squarespace **CNAME** `www` → [DNS-CORTEXPLUS-APP.md](./DNS-CORTEXPLUS-APP.md).  
Squarespace doğrulama kodu: [SQUARESPACE-DNS-EMAIL-NEDEN-GELMIYOR.md](./SQUARESPACE-DNS-EMAIL-NEDEN-GELMIYOR.md).

---

## İsteğe bağlı

- **GSC:** `GOOGLE_SITE_VERIFICATION` → Vercel → redeploy  
- **OAuth Audience:** GCP **Publish app** — [GOOGLE-OAUTH.md](./GOOGLE-OAUTH.md)

---

## Referans

| Dosya | İçerik |
|-------|--------|
| [GREENFIELD-CONNECT.md](./GREENFIELD-CONNECT.md) | Bağlantılar |
| [LAUNCH-SEQUENCE.md](./LAUNCH-SEQUENCE.md) | Launch checklist |
| [WORKSPACE-EMAIL.md](./WORKSPACE-EMAIL.md) | SMTP + Confirm |
| [IDENTITY.md](./IDENTITY.md) | `cortexplus@cortexplus.app` |

---

## Teslim cümlesi

**cortexplus.app** production’da kayıt, giriş ve Google OAuth ile çalışır; e-posta **Google Workspace SMTP** (`cortexplus@cortexplus.app`) ile Confirm email açık olduğunda launch kapanır. Kod ve doküman **`main`** üzerinde güncel.
