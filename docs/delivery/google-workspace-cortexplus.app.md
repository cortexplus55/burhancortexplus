# Google Workspace + OAuth — cortexplus.app

Cortex Plus e-posta (`@cortexplus.app`), Google ile giriş (Supabase Auth) ve isteğe bağlı Resend birlikte çalışır.

## 1. Google Workspace (e-posta)

1. [Google Workspace](https://workspace.google.com/) → **cortexplus.app** domainini ekle.
2. Domain doğrulama: Admin → **Account → Domains → Manage domains** → TXT kaydı (registrar DNS’e).
3. **MX kayıtları** (Google’ın verdiği değerler; tipik):

| Host | Tip | Öncelik | Değer |
|------|-----|---------|--------|
| `@` | MX | 1 | `ASPMX.L.GOOGLE.COM` |
| `@` | MX | 5 | `ALT1.ASPMX.L.GOOGLE.COM` |
| `@` | MX | 5 | `ALT2.ASPMX.L.GOOGLE.COM` |
| `@` | MX | 10 | `ALT3.ASPMX.L.GOOGLE.COM` |
| `@` | MX | 10 | `ALT4.ASPMX.L.GOOGLE.COM` |

4. Önerilen posta kutuları:
   - `destek@cortexplus.app` — kullanıcı iletişimi (İletişim sayfası)
   - `kvkk@cortexplus.app` — KVKK talepleri
   - `bildirim@` veya alt domain — aşağıda Resend

## 2. Google Cloud OAuth (Supabase Google giriş)

OAuth **Supabase** üzerinden çalışır; uygulama kodunda ayrı `GOOGLE_CLIENT_*` kullanılmaz (Vercel’e opsiyonel).

1. [Google Cloud Console](https://console.cloud.google.com/) — Workspace ile **aynı organizasyon** (önerilir).
2. Proje seç veya **cortexplus-platform** benzeri yeni proje.
3. **APIs & Services → OAuth consent screen**
   - User type: **External** (veya Internal yalnızca Workspace kullanıcıları)
   - App name: **Cortex Plus**
   - Support email: `destek@cortexplus.app`
   - Authorized domains: `cortexplus.app`
4. **Credentials → Create credentials → OAuth client ID → Web application**
   - **Authorized JavaScript origins:**
     - `https://cortexplus.app`
     - `http://localhost:3000`
   - **Authorized redirect URIs:**
     - `https://dgjfyewgrukglsehyntc.supabase.co/auth/v1/callback`
5. **Supabase Dashboard** → [cortexplus-platform](https://supabase.com/dashboard/project/dgjfyewgrukglsehyntc) → **Authentication → Providers → Google**
   - Enable
   - Client ID + Client Secret yapıştır
   - Kaydet

## 3. Supabase Auth URL’leri

**Authentication → URL Configuration**

| Alan | Değer |
|------|--------|
| Site URL | `https://cortexplus.app` |
| Redirect URLs | `https://cortexplus.app/**` |
| | `https://cortexplus.app/auth/callback` |
| | `https://cortexplus.app/auth/confirm` |
| | `http://localhost:3000/**` |
| | `https://*.vercel.app/**` (preview) |

## 4. Resend (transactional) + Workspace SPF

Uygulama `EMAIL_FROM=Cortex Plus <bildirim@cortexplus.app>` kullanır.

**Öneri:** Resend’de **`send.cortexplus.app`** veya **`notifications.cortexplus.app`** alt domaini doğrula; `EMAIL_FROM`’u buna güncelle. Böylece Workspace MX ile çakışma azalır.

Resend domain doğrulama kayıtlarını Resend panelinden kopyala (DKIM + SPF).

Workspace kök SPF örneği (Resend + Google birlikte — Resend dokümantasyonundaki `include:` ile birleştir):

```txt
v=spf1 include:_spf.google.com include:amazonses.com ~all
```

(Resend’in güncel SPF `include` değerini panelden al.)

## 5. Doğrulama

- [ ] Workspace’ten `destek@` → dış adrese test maili
- [ ] `https://cortexplus.app/giris` → **Google ile devam et** → callback → uygulama içi
- [ ] Kayıt → e-posta doğrulama linki domain `cortexplus.app` gösteriyor
- [ ] Veli daveti (Resend açıksa) gelen kutusuna düşüyor
