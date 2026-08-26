# Cortex Plus — teslim özeti

**Canlı site:** https://cortexplus.app  
**Supabase:** `dgjfyewgrukglsehyntc`  
**Vercel:** team `cortexplus55`, proje `burhancortexplus-app`  
**GitHub:** https://github.com/cortexplus55/burhancortexplus  

PayTR bu teslimde **dahil değil** (istek üzerine ayrı faz).

---

## Tamamlandı (doğrulandı)

| Konu | Kanıt |
|------|--------|
| Canlı ortam + Supabase | `GET /api/health` → `"ok":true`, `"supabaseProjectRef":"dgjfyewgrukglsehyntc"` |
| Google ile giriş | OAuth → `accounts.google.com`; Supabase provider açık + secret kayıtlı |
| Auth redirect | Supabase Site URL `https://cortexplus.app`, 4 redirect URL |
| Vercel env | Production’da `RESEND_API_KEY` ve uygulama env’leri |
| SEO | `/robots.txt`, `/sitemap.xml` canlı |
| GSC altyapı | `GOOGLE_SITE_VERIFICATION` env ile meta etiket (layout); değer Vercel’de set edilince aktif |
| Veritabanı | 13 migration Supabase’te uygulu |
| Kod + doküman | `main` branch güncel (OAuth, www rehberi, launch sequence) |

**Hızlı test:** https://cortexplus.app/giris → **Google ile devam et** → oturum / onboarding.

---

## Sizin 5–10 dakikalık kapanış (2 madde)

Bunlar dış servis girişi gerektirdiği için otomasyon tamamlayamadı; adımlar hazır.

### 1) www.cortexplus.app (Squarespace DNS)

Durum: **`www` DNS kaydı yok** (NXDOMAIN). Apex (`cortexplus.app`) çalışıyor. Vercel’de www → apex **308 redirect** ayarlı.

Squarespace → **cortexplus.app** → DNS → Custom record:

| Host | Type | Value |
|------|------|--------|
| `www` | CNAME | `30e3ed639132fa83.vercel-dns-017.com` |

Ayrıntı: [WWW-DNS-SQUARESPACE.md](./WWW-DNS-SQUARESPACE.md)

Doğrulama (yayıldıktan sonra):

```bash
curl -sI https://www.cortexplus.app/ | findstr /i "HTTP Location"
```

### 2) GitHub CI workflow

Dosya repoda **lokalde hazır:** `.github/workflows/ci.yml` (lint, typecheck, build, test).

`cortexplus55` token’ında `workflow` scope yok; bir kez cihaz onayı:

```bash
gh auth refresh -h github.com -s workflow
```

Sonra:

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint, typecheck, build, and test for cortex-plus"
git push origin main
```

Rehber: [GITHUB-CI-WORKFLOW-SCOPE.md](./GITHUB-CI-WORKFLOW-SCOPE.md)

---

## İsteğe bağlı (SEO / e-posta)

- **Search Console:** Mülk ekle → HTML etiket → `content` değerini Vercel’de `GOOGLE_SITE_VERIFICATION` → redeploy.
- **E-posta kayıt:** Supabase doğrulama maili + Resend domain (`bildirim@cortexplus.app`) — [AUTH-SETUP.md](./AUTH-SETUP.md).
- **OAuth Testing:** Herkese açık kullanıcılar için GCP Audience test kullanıcıları veya **Publish app** — [GOOGLE-OAUTH.md](./GOOGLE-OAUTH.md).

---

## Referans dokümanlar

| Dosya | İçerik |
|-------|--------|
| [GREENFIELD-CONNECT.md](./GREENFIELD-CONNECT.md) | Tek kaynak bağlantılar |
| [LAUNCH-SEQUENCE.md](./LAUNCH-SEQUENCE.md) | Launch checklist |
| [GOOGLE-OAUTH.md](./GOOGLE-OAUTH.md) | Google giriş |
| [AUTH-SETUP.md](./AUTH-SETUP.md) | E-posta + Auth URL |

---

## Teslim cümlesi

**cortexplus.app** production’da çalışır durumda; Google giriş ve Supabase greenfield bağlantısı tamam. Kalan iş yalnızca **Squarespace www CNAME** ve **GitHub CI workflow push** (yukarıdaki iki kısa adım). Bunlar bittiğinde launch listesi PayTR hariç kapanmış sayılır.
