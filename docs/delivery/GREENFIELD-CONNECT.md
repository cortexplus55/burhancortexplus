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
| GitHub `burhancortexplus` | Yerel **2 commit** hazır; remote **boş** (`size: 0`). Push: `gh auth login` → **cortexplus55** → `.\scripts\push-burhancortexplus.ps1` |
| Supabase `dgjfyewgrukglsehyntc` | Şema + seed uygulandı |
| Vercel proje **`burhancortexplus`** | Önce GitHub push + [Vercel GitHub App](https://github.com/apps/vercel) → **burhancortexplus**; sonra agent `create_git_project` veya [vercel.com/new](https://vercel.com/new) |

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
