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
| Kayıt / giriş (e-posta) | Confirm email + Custom SMTP kapalı → prod kayıt oturum açar — [EMAIL-SIGNUP-FIX.md](./EMAIL-SIGNUP-FIX.md) |
| Post-login uygulama | `/ogretmen`, AppShell — Astra sunucu/client ayrımı düzeltildi |
| Google OAuth marka | GCP Branding kayıtlı; consent **Cortex Plus** (undefined yok) — [GOOGLE-OAUTH.md](./GOOGLE-OAUTH.md) |
| Supabase Google provider | Açık, Client ID + callback doğru |
| PWA ikonları | `/icon/192`, `/icon/512` (manifest) |
| Auth redirect | Site URL `https://cortexplus.app`, redirect listesi |
| Vercel env | Production’da `RESEND_API_KEY` ve uygulama env’leri |
| SEO | `/robots.txt`, `/sitemap.xml` canlı |
| Veritabanı | Migration’lar Supabase’te (profiles INSERT dahil) |
| GitHub CI | `.github/workflows/ci.yml` — `main`’de |
| DNS runbook | www + Resend kayıtları tek tabloda — [DNS-CORTEXPLUS-APP.md](./DNS-CORTEXPLUS-APP.md) |

**Hızlı test:** https://cortexplus.app/kayit · https://cortexplus.app/giris → **Google ile devam et**

---

## DNS (Squarespace) — tek manuel adım

Kayıtlar hazır; Squarespace **Kayıt ekleyin** öncesi **`cortexplus@cortexplus.app`** adresine gelen **6 haneli kod** gerekir (Gmail’de henüz görülmediyse `burhan55600@gmail.com` ICANN mailine de bakın).

1. [DNS Ayarları](https://account.squarespace.com/domains/managed/cortexplus.app/dns/dns-settings) → kod → [DNS-CORTEXPLUS-APP.md](./DNS-CORTEXPLUS-APP.md) kayıtlarını ekle  
2. Resend → **Verify DNS Records**  
3. Supabase SMTP + **Confirm email** aç — [EMAIL-SIGNUP-FIX.md](./EMAIL-SIGNUP-FIX.md)

**www:** Vercel redirect hazır; CNAME eklenince `https://www.cortexplus.app` → apex. Apex zaten canlı.

---

## İsteğe bağlı

- **GSC:** `GOOGLE_SITE_VERIFICATION` → Vercel → redeploy  
- **OAuth Audience:** Testing dışı kullanıcılar için GCP **Publish app** — [GOOGLE-OAUTH.md](./GOOGLE-OAUTH.md)

---

## Referans

| Dosya | İçerik |
|-------|--------|
| [GREENFIELD-CONNECT.md](./GREENFIELD-CONNECT.md) | Bağlantılar |
| [LAUNCH-SEQUENCE.md](./LAUNCH-SEQUENCE.md) | Launch checklist |
| [DNS-CORTEXPLUS-APP.md](./DNS-CORTEXPLUS-APP.md) | www + Resend DNS |
| [IDENTITY.md](./IDENTITY.md) | `cortexplus@cortexplus.app` |

---

## Teslim cümlesi

**cortexplus.app** production’da kayıt, giriş ve Google OAuth ile sorunsuz çalışır; kod ve doküman **`main`** üzerinde güncel. www ve Resend doğrulama maili için DNS kayıtları dokümante edildi — Squarespace doğrulama kodu girildiğinde aynı runbook ile kapanır.
