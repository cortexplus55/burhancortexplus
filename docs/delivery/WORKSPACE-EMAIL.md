# E-posta — Google Workspace (Resend yok)

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

Production (+ preview) env:

| Değişken | Değer |
|----------|--------|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `cortexplus@cortexplus.app` |
| `SMTP_PASS` | *(uygulama şifresi — gizli)* |
| `EMAIL_FROM` | `Cortex Plus <cortexplus@cortexplus.app>` |

**Sil:** `RESEND_API_KEY`

Redeploy.

## 3) Supabase Auth SMTP

Proje: `dgjfyewgrukglsehyntc` → **Authentication** → **Emails** → **SMTP Settings**

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
3. `/admin/sistem` — SMTP değişkenleri “Yapılandırıldı”.

## Limitler

Workspace gönderim kotası (Business Starter ~2000/gün) çoğu lansman için yeterli. İleride hacim artarsa SMTP relay veya transactional sağlayıcı tekrar değerlendirilir.

## Eski dokümanlar

- Resend + Squarespace DNS: [DNS-CORTEXPLUS-APP.md](./DNS-CORTEXPLUS-APP.md) §2 artık **opsiyonel / kullanılmıyor**.
- Geçici prod fix: [EMAIL-SIGNUP-FIX.md](./EMAIL-SIGNUP-FIX.md) — Workspace SMTP sonrası Confirm email **açık** olmalı.
