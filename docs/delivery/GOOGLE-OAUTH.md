# Google ile giriş — Cortex Plus

Uygulama zaten **Supabase OAuth** kullanıyor (`/giris`, `/kayit` → **Google ile devam et**). Eksik olan yalnızca Google + Supabase panel ayarları.

## Durum (canlı kontrol)

| Adım | Durum |
|------|--------|
| GCP projesi `cortexplus-auth`, istemci **Cortex Plus Web** | Tamam (redirect + JS origins doğru) |
| Supabase **Google provider** kayıtlı ve açık | **Tamam** — `/auth/v1/authorize?provider=google` → `accounts.google.com` |
| OAuth **Testing** + test kullanıcıları | Giriş testi **brhnondr55@gmail.com** ile başarılı; yeni kullanıcılar için Audience’da e-posta ekleyin veya uygulamayı **Publish** edin |

**Client ID (Web):** `831373547846-0gna3edio8gg8pomhffm9lg5q1jo9m50.apps.googleusercontent.com`

Son doğrulama: [cortexplus.app/giris](https://cortexplus.app/giris) → Google → `/onboarding` (oturum açıldı).

## 1) Google Cloud (OAuth istemcisi)

1. [Google Cloud Console → Credentials](https://console.cloud.google.com/auth/clients?project=cortexplus-auth&authuser=1) — **cortexplus@cortexplus.app** (`authuser=1`).
2. **OAuth consent screen** — uygulama adı: `Cortex Plus`, destek e-postası, test kullanıcıları (yayınlanmadan önce kendi Gmail’inizi ekleyin).
3. **Create credentials → OAuth client ID → Web application**
   - **Authorized JavaScript origins:**
     - `https://cortexplus.app`
     - `http://localhost:3000`
   - **Authorized redirect URIs** (zorunlu, birebir):
     - `https://dgjfyewgrukglsehyntc.supabase.co/auth/v1/callback`
4. **Client ID** ve **Client secret**’ı kopyalayın.

## 2) Supabase

1. [Providers → Google](https://supabase.com/dashboard/project/dgjfyewgrukglsehyntc/auth/providers?provider=Google)
2. **Enable Sign in with Google** → açık
3. **Client IDs** → Web Client ID
4. **Client Secret** → OAuth client secret
5. **Save**

Callback URL (Google tarafına yapıştırılacak):  
`https://dgjfyewgrukglsehyntc.supabase.co/auth/v1/callback`

## 3) Supabase redirect URLs (yapıldı)

Site URL: `https://cortexplus.app`  
Redirect listesinde en az: `https://cortexplus.app/**`, `http://localhost:3000/**`, `https://*.vercel.app/**`

## 4) Test

1. [https://cortexplus.app/giris](https://cortexplus.app/giris) → **Google ile devam et**
2. Google hesabı seç → siteye dönüş → `/ogretmen` (veya `next` parametresi)
3. Kayıt sihirbazında Google → `/auth/callback?next=/kayit/tamamla`

Hata: `/auth/auth-code-error` → redirect URL veya Supabase Google anahtarları yanlış.

## Not

Vercel’de `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` **gerekmez** (sunucu tarafı custom flow yok). İsterseniz yedek olarak `.env.local`’a yazılabilir.
