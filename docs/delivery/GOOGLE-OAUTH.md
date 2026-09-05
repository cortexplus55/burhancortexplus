# Google ile giriş — Cortex Plus

Uygulama zaten **Supabase OAuth** kullanıyor (`/giris`, `/kayit` → **Google ile devam et**). Eksik olan yalnızca Google + Supabase panel ayarları.

## Durum (canlı kontrol — 2026-09-05 panelden yeniden doğrulandı)

| Adım | Durum |
|------|--------|
| GCP projesi `cortexplus-auth`, istemci **Cortex Plus Web** | Tamam (redirect + JS origins doğru) |
| Supabase **Google provider** açık | **Tamam** — panelde yeşil `Enabled`; Client ID aşağıdakiyle birebir aynı, Client Secret dolu, Callback URL `https://dgjfyewgrukglsehyntc.supabase.co/auth/v1/callback` |
| Supabase **Site URL** | **Tamam** — `https://cortexplus.app` |
| Supabase **Redirect URLs** | **Tamam** — 4 kayıt: `/auth/callback`, `cortexplus.app/**`, `localhost:3000/**`, `*.vercel.app/**` |
| Supabase **Allow new users to sign up** | **Açık** — kapalı olsaydı Google dahil hiçbir yeni kayıt olmazdı |
| Uygulama kodu | **Tamam** — `/giris` ve `/kayit` ikisi de `signInWithGoogle` çağırıyor, `/auth/callback` kodu oturuma çeviriyor |
| Google yetkilendirme ucu | **Tamam** — istemci kimliğiyle hesap seçici açılıyor, uygulama alanı `dgjfyewgrukglsehyntc.supabase.co` |
| GCP **Branding** (ad, URL’ler, destek e-postası) | **Tamam** — `authuser=1` ile kaydedildi (2026-08-27) |
| GCP **Publishing status** | ✅ **In production** — 2026-09-05'te `Testing`'den çıkarıldı |
| GCP **Doğrulama (verification)** | **Gerekmiyor** — Verification Center: "not requesting any sensitive or restricted scopes" |
| GCP **Authorized redirect URI** | **Tamam** — `https://dgjfyewgrukglsehyntc.supabase.co/auth/v1/callback` (Supabase'inkiyle birebir) |
| GCP **JS origins** | **Tamam** — `https://cortexplus.app`, `http://localhost:3000` |
| GCP **Authorized domains** | **Tamam** — `cortexplus.app`, `dgjfyewgrukglsehyntc.supabase.co` |

**Client ID (Web):** `831373547846-0gna3edio8gg8pomhffm9lg5q1jo9m50.apps.googleusercontent.com`

### 2026-09-05: uygulama `Testing`'deydi — yayına alındı

Konsola girildiğinde **Publishing status: Testing** çıktı. Yani o ana kadar
**yalnızca elle eklenmiş test kullanıcıları** Google ile girebiliyordu; başka
herkes "erişim engellendi" alıyordu. Google ile girmiş 5 hesabın (27–31 Ağustos)
hepsi test kullanıcısıymış.

**Publish app → Push to production → Confirm** ile yayına alındı. Doğrulama
gerekmediği için **anında** etkili oldu; artık Google hesabı olan herkes
girebilir ve kayıt olabilir.

### İki bilinçli eksik — dokunmayın

**1. App logo boş bırakıldı.** Konsolun kendi uyarısı: *"After you upload a
logo, you will need to submit your app for verification unless the app … has a
publishing status of Testing."* Artık `In production` olduğumuz için **logo
yüklemek uygulamayı doğrulama kuyruğuna sokar** — haftalar sürebilir ve o süre
boyunca giriş kısıtlanabilir. Logo, marka doğrulaması bilinçli olarak
istendiğinde eklenmeli, önce değil.

**2. Onay ekranında `dgjfyewgrukglsehyntc.supabase.co` yazıyor**, "Cortex Plus"
değil. Sebebi aşağıdaki bölümde: istek Supabase'in callback alan adı üzerinden
gidiyor. Çözümü Supabase **Custom Domain** (Pro plan) — proje şu an **Free**
planda. Kozmetik; girişi engellemiyor.

Son uçtan uca doğrulama: [cortexplus.app/giris](https://cortexplus.app/giris) → Google → `/onboarding` (oturum açıldı).

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
