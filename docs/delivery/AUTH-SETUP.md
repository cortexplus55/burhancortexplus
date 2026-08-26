# Auth: e-posta doğrulama & Google

Proje: **dgjfyewgrukglsehyntc** · Site: **https://cortexplus.app**

## Supabase → Authentication → URL Configuration

- **Site URL:** `https://cortexplus.app`
- **Redirect URLs:**
  - `https://cortexplus.app/auth/callback**`
  - `https://cortexplus.app/auth/confirm**`
  - `http://localhost:3000/auth/callback**`
  - `https://*.vercel.app/auth/callback**`

Uygulama kayıt/e-posta yenileme için yönlendirme:  
`/auth/callback?next=/kayit/tamamla`

## E-posta (Resend)

Vercel env:

- `RESEND_API_KEY`
- `EMAIL_FROM` — örn. `Cortex Plus <bildirim@cortexplus.app>` (domain Resend’de doğrulanmış olmalı)

Supabase → Authentication → **SMTP** (veya built-in mail):  
Canlıda mail gitmiyorsa **Resend SMTP** veya Supabase custom SMTP kullan.

**E-posta doğrulama zorunlu mu?**  
Açıksa: kayıt sonrası oturum yok → kullanıcı `/email-dogrula` görür (beklenen).  
Kapalıysa (MVP): kayıt anında oturum + `completeSignup` — Dashboard’da “Confirm email” ayarını bilinçli seç.

## Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) → OAuth client (Web).
2. **Authorized redirect URI:**  
   `https://dgjfyewgrukglsehyntc.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Providers → Google: Client ID + Secret.
4. Vercel (isteğe bağlı, kod kullanmıyorsa gerekmez):  
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` yalnızca custom flow varsa.

Uygulama: `/giris` ve kayıt son adımı **Google ile devam et** → `/auth/callback?next=...`

## Test checklist

- [ ] `/api/health` → `ok: true`
- [ ] E-posta kayıt → mail gelir → link → `/kayit/tamamla` → `/ogretmen` veya role home
- [ ] Google kayıt (onaylı) → aynı tamamlama
- [ ] Hatalı link → `/auth/auth-code-error`
