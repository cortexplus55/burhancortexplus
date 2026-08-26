# Canlıya çıkış — cortexplus.app

**Son kontrol:** 2026-08-26

## Tek kaynak özeti

| Bileşen | Değer |
|---------|--------|
| GitHub | https://github.com/cortexplus55/burhancortexplus |
| Vercel Root Directory | `cortex-plus` |
| Supabase ref | `dgjfyewgrukglsehyntc` |
| Supabase URL | `https://dgjfyewgrukglsehyntc.supabase.co` |
| Canlı domain | `https://cortexplus.app` |

## Mevcut durum (agent tespiti)

| Konu | Durum |
|------|--------|
| GitHub `main` | `cortexplus55/burhancortexplus` bağlı; **Origin tasarım commit/push bekliyor** |
| Vercel CLI oturumu | `burhan55600-5553` → proje `cortex-plus` → **cortex-plus-theta.vercel.app** |
| Vercel env (production) | Yalnızca 3 public Supabase/App URL; **`SUPABASE_SECRET_KEY`, `OPENAI_*`, `RESEND_*` eksik** |
| `NEXT_PUBLIC_APP_URL` (prod) | `https://cortex-plus-theta.vercel.app` → **`https://cortexplus.app` olmalı** |
| `cortexplus.app` Vercel | **Başka Vercel hesabında/team’de kayıtlı** — `burhan55600-5553` ekleyemiyor |
| DNS `cortexplus.app` | A → `216.198.79.1` (henüz Vercel `76.76.21.21` / CNAME değil) |

## Hedef mimari

```
Kullanıcı → cortexplus.app (DNS → Vercel)
         → Next.js (cortex-plus/)
         → Supabase dgjfyewgrukglsehyntc
Google OAuth → Supabase /auth/v1/callback
E-posta      → Google Workspace (@) + Resend (transactional)
```

## Adım 1 — Doğru Vercel team + proje

1. [vercel.com](https://vercel.com) → **cortexplus55** team (domain’in kayıtlı olduğu hesap).
2. **Add New → Project** → Import **`cortexplus55/burhancortexplus`**
3. **Root Directory:** `cortex-plus`
4. Framework: Next.js (otomatik)
5. Production branch: `main`

CLI (domain sahibi hesapla):

```powershell
npx vercel login
npx vercel link   # team cortexplus55, proje burhancortexplus
```

Eski `burhan55600-5553/cortex-plus` projesini kapatabilir veya yalnızca preview bırakabilirsiniz.

## Adım 2 — Domain DNS (registrar)

Vercel → Project → **Settings → Domains** → `cortexplus.app` + `www.cortexplus.app`

| Kayıt | Tip | Değer |
|-------|-----|--------|
| `@` | A | `76.76.21.21` |
| `www` | CNAME | `cname.vercel-dns.com` |

(Alternatif: yalnızca CNAME — Vercel panelindeki talimatı esas al.)

Repo’daki `cortex-plus/vercel.json` **www → apex** yönlendirmesini yapar.

**Google Workspace MX** kayıtları ayrıca kalır; [google-workspace-cortexplus.app.md](./google-workspace-cortexplus.app.md).

## Adım 3 — Vercel environment variables

Production + Preview için `cortex-plus/.env.example` içindeki tüm zorunlu alanlar.

Minimum prod:

```env
NEXT_PUBLIC_APP_URL=https://cortexplus.app
NEXT_PUBLIC_APP_DOMAIN=cortexplus.app
NEXT_PUBLIC_SUPABASE_URL=https://dgjfyewgrukglsehyntc.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=...
OPENAI_API_KEY=...
RESEND_API_KEY=...
EMAIL_FROM=Cortex Plus <bildirim@cortexplus.app>
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
APP_SECRET=...
```

CLI:

```powershell
cd cortex-plus
npx vercel env pull .env.vercel.local
# Eksikleri dashboard veya vercel env add ile doldur
```

## Adım 4 — Supabase + Google

[google-workspace-cortexplus.app.md](./google-workspace-cortexplus.app.md) — OAuth + Auth URL’leri.

Migration:

```powershell
cd cortex-plus
npx supabase link --project-ref dgjfyewgrukglsehyntc
npx supabase db push
```

## Adım 5 — Deploy

Git push (Origin + go-live dosyaları):

```powershell
cd C:\Users\burha\OneDrive\Masaüstü\Cortex-Plus-Dev
.\scripts\push-burhancortexplus.ps1
```

Vercel Git bağlıysa otomatik production deploy. Manuel:

```powershell
cd cortex-plus
npx vercel deploy --prod
```

## Adım 6 — Smoke test

`cortex-plus/docs/delivery/deploy-checklist.md` maddeleri — özellikle:

- [ ] `https://cortexplus.app/` (marketing)
- [ ] Kayıt / giriş / Google OAuth
- [ ] AI sohbet (OPENAI + SUPABASE_SECRET_KEY)
- [ ] E-posta daveti (Resend)

## Yardımcı script

```powershell
.\scripts\go-live-cortexplus.ps1
```

DNS özeti ve env eksiklerini listeler.
