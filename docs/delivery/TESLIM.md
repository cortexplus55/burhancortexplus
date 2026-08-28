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

## E-posta (Workspace SMTP) — launch kapanışı

Tek kaynak: **[WORKSPACE-EMAIL.md](./WORKSPACE-EMAIL.md)**

1. Google **uygulama şifresi** (`cortexplus@cortexplus.app`, 2FA açık).
2. Vercel Production + Preview: `SMTP_*`, `EMAIL_FROM`; `RESEND_API_KEY` sil; redeploy.  
   CLI: `cortex-plus/scripts/setup-workspace-smtp-vercel.ps1` (team erişimi gerekir).
3. Supabase Auth → custom SMTP (aynı Gmail).
4. **Confirm email açık** (SMTP doğrulandıktan sonra).
5. `/admin/sistem` → **Workspace SMTP bağlantısını test et**; kayıt smoke.

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
