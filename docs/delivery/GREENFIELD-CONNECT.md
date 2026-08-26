# Greenfield bağlantı — tek GitHub kaynağı

## Tek kaynak (zorunlu)

| Alan | Değer |
|------|--------|
| **GitHub** | https://github.com/cortexplus55/burhancortexplus |
| **Vercel Root Directory** | `cortex-plus` |
| **Supabase proje ref** | `dgjfyewgrukglsehyntc` |
| **Supabase URL** | `https://dgjfyewgrukglsehyntc.supabase.co` |

**Kullanma:** `burhan55600-pixel/*`, eski `cortexplus-platform`, eski `cortex-plus` repo, Supabase `gwqonggqzvavljguiryx`.

## Durum

| Bileşen | Durum |
|---------|--------|
| GitHub `burhancortexplus` | **`main` push edildi** (`cortexplus55`); güncellemeler için `gh auth setup-git` + `git push origin main` |
| Supabase `dgjfyewgrukglsehyntc` | Şema + seed (ör. **427** okul) |
| Vercel **cortexplus55 / cortexplus-prod** | Git import, Root **`cortex-plus`**; prod env: `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_APP_URL` |
| Vercel **eski / geçici** | `burhan55600-5553s-projects/cortex-plus` → **https://cortex-plus-theta.vercel.app** (isteğe bağlı kapat) |

### Supabase Auth (Dashboard → Authentication → URL Configuration)

- **Site URL:** `https://cortexplus-prod.vercel.app` (veya güncel production deployment URL)
- **Redirect URLs:** aynı URL, `http://localhost:3000/**`, `https://*.vercel.app/**`

## Vercel + GitHub (`cortexplus55`)

1. GitHub → [Vercel App](https://github.com/apps/vercel) → **Configure** → **`burhancortexplus`** erişimi.
2. [vercel.com/new](https://vercel.com/new) → team **cortexplus55** → Import **`cortexplus55/burhancortexplus`**.
3. **Root Directory:** `cortex-plus`
4. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (+ `.env.example`).

## Supabase ↔ GitHub

Project **cortexplus-platform** (`dgjfyewgrukglsehyntc`) → Integrations → GitHub → **`cortexplus55/burhancortexplus`**.

## Hazır sinyalleri

- **`github hazır`** — push + Vercel import bitti; env + deploy doğrula  
- **`supabase cli hazır`** — `scripts/setup-supabase.ps1`  
- **`astra plus hazır`** — Astra Plus audit
