# Auth: e-posta doğrulama & Google

Proje: **dgjfyewgrukglsehyntc** · Site: **https://cortexplus.app**

**E-posta kurulumu (güncel):** [WORKSPACE-EMAIL.md](./WORKSPACE-EMAIL.md) — Google Workspace SMTP, gönderen `cortexplus@cortexplus.app`. Resend **kullanılmıyor**.

## Supabase → Authentication → URL Configuration

- **Site URL:** `https://cortexplus.app`
- **Redirect URLs:**
  - `https://cortexplus.app/auth/callback**`
  - `https://cortexplus.app/auth/confirm**`
  - `http://localhost:3000/auth/callback**`
  - `https://*.vercel.app/auth/callback**`

Uygulama kayıt/e-posta yenileme için yönlendirme:  
`/auth/callback?next=/kayit/tamamla`

## E-posta (Workspace Gmail SMTP)

**Vercel** (veli daveti, uygulama maili):

- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587`
- `SMTP_USER=cortexplus@cortexplus.app`
- `SMTP_PASS` — Google **uygulama şifresi** (hesap şifresi değil)
- `EMAIL_FROM=Cortex Plus <cortexplus@cortexplus.app>`

**Supabase** → Authentication → Emails → **SMTP Settings** (aynı kimlik bilgileri).

**Confirm email:** Production’da **açık** olmalı. Kapalıyken kayıt anında oturum açılır (geçici MVP — bkz. [EMAIL-SIGNUP-FIX.md](./EMAIL-SIGNUP-FIX.md)).

Confirm açıkken akış:

1. `/kayit` → Supabase doğrulama maili gönderir.
2. Kullanıcı `/email-dogrula` görür (oturum yok).
3. Maildeki link → `/auth/callback` → `/kayit/tamamla` → rol ana sayfası.

Admin: `/admin/sistem` → **Workspace SMTP bağlantısını test et** (`nodemailer.verify`).

## Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) → OAuth client (Web).
2. **Authorized redirect URI:**  
   `https://dgjfyewgrukglsehyntc.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Providers → Google: Client ID + Secret.

Uygulama: `/giris` ve kayıt **Google ile devam et** → `/auth/callback?next=...`

## Test checklist

- [ ] `/api/health` → `ok: true`
- [ ] `/admin/sistem` → SMTP yapılandırıldı + bağlantı testi OK
- [ ] E-posta kayıt → mail gelir → link → `/kayit/tamamla` → role home
- [ ] Google kayıt → aynı tamamlama (Confirm OAuth’u etkilemez)
- [ ] Hatalı link → `/auth/auth-code-error`
