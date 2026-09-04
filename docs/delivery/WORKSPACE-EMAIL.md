# E-posta — Google Workspace (Resend yok)

> ## ✅ 2026-09-04 — bu kurulum TAMAM, aşağısı referans
>
> Panellerde ve kodda tek tek doğrulandı:
>
> | Kontrol | Sonuç |
> |---|---|
> | Google uygulama şifresi geçerli mi | **`SMTP_VERIFY_OK`** — `node --env-file=.env.local scripts/verify-workspace-smtp.mjs` Gmail'e bağlanıp kimlik doğruladı |
> | Supabase özel SMTP | **Açık** — `smtp.gmail.com`, 587, `cortexplus@cortexplus.app`, gönderen adı `Cortex Plus` |
> | Supabase **Confirm email** | **Açık** · yeni kayıt açık |
> | Supabase Auth kayıtları (24 saat) | 100 olay, **hata + uyarı filtresi boş** — 07:23'teki gerçek `/recover` e-postası hatasız |
> | Vercel env | `SMTP_PASS` (Production) + `EMAIL_FROM` (All Environments) **var**, `RESEND_API_KEY` **yok** |
>
> **Kayıt/doğrulama e-postaları Supabase'in kendi SMTP'sinden gidiyor**, Vercel
> env'inden değil. Vercel'deki `SMTP_PASS` yalnızca uygulamanın kendi yolladığı
> veli davet/istek e-postalarını besliyor (`lib/email/mailer.ts`).
>
> Kapanmayan tek küçük halka: Vercel'deki `SMTP_PASS` (28 Ağu) ile yerelde
> doğrulanmış şifrenin aynı olduğu okunamıyor — Vercel gizli değeri göstermiyor.
> Teyit için `/admin/sistem` → **Workspace SMTP bağlantısını test et**.

**Gönderen:** `cortexplus@cortexplus.app`  
**Alım:** Zaten Workspace MX (`smtp.google.com`) — ek DNS (Resend) gerekmez.

## Önemli: Hesap şifresi ≠ SMTP şifresi

Google **`smtp.gmail.com` hesap şifreni kabul etmez** (535 BadCredentials). `SMTP_PASS` alanına yalnızca **uygulama şifresi** (16 karakter, 2FA açıkken oluşturulur) yazılır.

Hesap şifreni değiştirdiysen önce normal giriş yap, sonra uygulama şifresi üret; `SMTP_PASS` **asla** chat’e yapıştırma.

## 1) Google uygulama şifresi

1. `cortexplus@cortexplus.app` ile [Google Hesabı](https://myaccount.google.com/?authuser=1) → **Güvenlik**.
2. **2 Adımlı Doğrulama** açık olmalı (yoksa önce aç).
3. **Uygulama şifreleri** → uygulama: **Mail**, cihaz: **Cortex Plus** → 16 haneli şifreyi kopyala (boşluksuz).

Doğrudan: https://myaccount.google.com/apppasswords?authuser=1

## 2) Vercel (burhancortexplus-app)

Production env. **Yalnızca ilk iki satır zorunlu** — `getSmtpConfig()`
(`src/lib/email/smtp.ts:12`) sadece bu ikisini arıyor, yoksa `null` dönüyor:

| Değişken | Değer | Durum |
|----------|--------|---|
| `SMTP_PASS` | *(uygulama şifresi — gizli)* | **zorunlu** · Vercel'de var (28 Ağu) |
| `EMAIL_FROM` | `Cortex Plus <cortexplus@cortexplus.app>` | **zorunlu** · Vercel'de var |
| `SMTP_HOST` | `smtp.gmail.com` | opsiyonel — kodda varsayılan (`smtp.ts:20`) |
| `SMTP_PORT` | `587` | opsiyonel — kodda varsayılan (`smtp.ts:18`) |
| `SMTP_USER` | `cortexplus@cortexplus.app` | opsiyonel — kodda varsayılan (`smtp.ts:17`) |

> Son üçü production'da **tanımlı değil ve olmasına gerek yok**; kod aynı
> değerlere düşüyor. Bu tablo eskiden üçünü de zorunlu gösteriyordu ve
> kurulum yarım kalmış gibi okunuyordu — öyle değil.

**Sil:** `RESEND_API_KEY` — ✅ zaten yok (2026-09-04 kontrolü).

**CLI (team `cortexplus55` erişimiyle):** `cortex-plus/scripts/setup-workspace-smtp-vercel.ps1` — önce `$env:SMTP_PASS` set et; chat'e yapıştırma.

Redeploy.

## 3) Supabase Auth SMTP

Proje: `dgjfyewgrukglsehyntc` → **Authentication** → **Emails** → **SMTP Settings**  
Ayrıntılı sıra (Confirm en son): [SUPABASE-WORKSPACE-SMTP.md](./SUPABASE-WORKSPACE-SMTP.md)

| Alan | Değer |
|------|--------|
| Enable custom SMTP | **Açık** |
| Host | `smtp.gmail.com` |
| Port | `587` |
| Username | `cortexplus@cortexplus.app` |
| Password | *(aynı uygulama şifresi)* |
| Sender email | `cortexplus@cortexplus.app` |
| Sender name | `Cortex Plus` |

**Sign In / Providers** → **Confirm email** → **Açık** → Save.

URL Configuration: Site URL `https://cortexplus.app`, redirect’ler mevcut kalsın.

## 4) Resend iptali

1. [Resend Domains](https://resend.com/domains) → `cortexplus.app` domainini sil (veya hesabı kapat).
2. Vercel’den `RESEND_API_KEY` kaldırıldığından emin ol.

## 5) Test

1. https://cortexplus.app/kayit — yeni e-posta → gelen kutusunda **Confirm** linki.
2. Veli daveti (varsa akış) → gönderen `cortexplus@cortexplus.app`.
3. `/admin/sistem` — SMTP değişkenleri “Yapılandırıldı” + **Workspace SMTP bağlantısını test et** (deploy sonrası).

**Yerel doğrulama (prod’a şifre koymadan):** `npx dotenv -e .env.local -- node scripts/verify-workspace-smtp.mjs` → `SMTP_VERIFY_OK`.

## Limitler

Workspace gönderim kotası (Business Starter ~2000/gün) çoğu lansman için yeterli. İleride hacim artarsa SMTP relay veya transactional sağlayıcı tekrar değerlendirilir.

## Eski dokümanlar

- Resend + Squarespace DNS: [DNS-CORTEXPLUS-APP.md](./DNS-CORTEXPLUS-APP.md) §2 artık **opsiyonel / kullanılmıyor**.
- Geçici prod fix: [EMAIL-SIGNUP-FIX.md](./EMAIL-SIGNUP-FIX.md) — Workspace SMTP sonrası Confirm email **açık** olmalı.
