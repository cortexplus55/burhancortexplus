# Google ile giriş — Cortex Plus

Uygulama zaten **Supabase OAuth** kullanıyor (`/giris`, `/kayit` → **Google ile devam et**). Eksik olan yalnızca Google + Supabase panel ayarları.

## Durum (canlı kontrol)

| Adım | Durum |
|------|--------|
| GCP projesi `cortexplus-auth`, istemci **Cortex Plus Web** | Tamam (redirect + JS origins doğru) |
| Supabase **Google provider** kayıtlı ve açık | **Tamam** — `/auth/v1/authorize?provider=google` → `accounts.google.com` |
| OAuth **Testing** + test kullanıcıları | Test kullanıcısı: **`cortexplus@cortexplus.app`** (ve gerekirse ekip alias’ları); herkese açık için **Publish app** |

**Client ID (Web):** `831373547846-0gna3edio8gg8pomhffm9lg5q1jo9m50.apps.googleusercontent.com`

Son doğrulama: [cortexplus.app/giris](https://cortexplus.app/giris) → Google → `/onboarding` (oturum açıldı).

## Onay ekranı: `undefined` ve `*.supabase.co` görünmesi

Google, OAuth isteğini **Supabase callback domain’i** üzerinden gördüğü için satırda `dgjfyewgrukglsehyntc.supabase.co` yazabilir. **`undefined`** genelde marka / proje adının panelde eksik olmasından gelir.

### Hemen yap (≈5 dk)

1. **Supabase** → [Project Settings → General](https://supabase.com/dashboard/project/dgjfyewgrukglsehyntc/settings/general)  
   - **Project name:** `Cortex Plus` → Save  
2. **Supabase** → [Authentication → URL Configuration](https://supabase.com/dashboard/project/dgjfyewgrukglsehyntc/auth/url-configuration)  
   - **Site URL:** `https://cortexplus.app`  
3. **Google Cloud** — yalnızca **`cortexplus@cortexplus.app`** ile [Branding](https://console.cloud.google.com/auth/branding?project=cortexplus-auth) (proje `cortexplus-auth`):  
   - **App name:** `Cortex Plus`  
   - **User support email:** `cortexplus@cortexplus.app`  
   - **App logo** (kare, ≥128px) — indir: [https://cortexplus.app/icon/512](https://cortexplus.app/icon/512) (deploy sonrası) veya yerel `cortex-plus` build ile `/icon/512`  
   - **Application home page:** `https://cortexplus.app`  
   - **Privacy policy:** `https://cortexplus.app/gizlilik`  
   - **Terms of service:** `https://cortexplus.app/kullanim-kosullari`  
4. **Testing** modundaysanız test kullanıcılarına **`cortexplus@cortexplus.app`** (ve gerekirse ekip) ekleyin; kişisel `@gmail.com` yalnızca geçici test içindir — canlıda **Publish app** hedeflenir.

### İsteğe bağlı (daha profesyonel)

Supabase **Custom Domain** (Pro): örn. `auth.cortexplus.app` — onay ekranında `supabase.co` yerine kendi alan adınız görünür. Ayrıntı: [Supabase custom domains](https://supabase.com/docs/guides/platform/custom-domains).

---

## 1) Google Cloud (OAuth istemcisi)

1. [Google Cloud Console → Credentials](https://console.cloud.google.com/auth/clients?project=cortexplus-auth&authuser=1) — **cortexplus@cortexplus.app** (`authuser=1`).
2. **OAuth consent screen** — uygulama adı: `Cortex Plus`, destek e-postası **`cortexplus@cortexplus.app`**, test kullanıcıları (Testing modunda yalnızca Workspace hesabı / ekip adresleri).
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
