# Greenfield bağlantı — tek GitHub kaynağı

## Tek kaynak (zorunlu)

| Alan | Değer |
|------|--------|
| **GitHub** | https://github.com/cortexplus55/burhancortexplus |
| **Vercel Root Directory** | `cortex-plus` |
| **Supabase proje ref** | `dgjfyewgrukglsehyntc` |
| **Supabase URL** | `https://dgjfyewgrukglsehyntc.supabase.co` |
| **Vercel CLI link** | team **`cortexplus55`**, proje **`burhancortexplus-app`** — link repo **kökünde** (preview: `burhancortexplus-app-*-cortexplus55.vercel.app`) |
| **Vercel prod env** | proje **`burhancortexplus-app`** → **`cortexplus.app`** |

**CLI kurulum / doğrulama:** [CLI-CONNECT.md](./CLI-CONNECT.md) · `scripts/setup-cli.ps1` · `scripts/verify-cli.ps1`

**Kullanma:** `burhan55600-pixel/*`, `burhan55600-5553s-projects/cortex-plus`, eski `cortexplus-platform`, eski `cortex-plus` repo, Supabase `gwqonggqzvavljguiryx`.

## Durum

Yol haritası (PayTR hariç sıra): [LAUNCH-SEQUENCE.md](./LAUNCH-SEQUENCE.md) · Auth: [AUTH-SETUP.md](./AUTH-SETUP.md)

| Bileşen | Durum |
|---------|--------|
| GitHub `burhancortexplus` | **`main` push edildi** (`cortexplus55`); güncellemeler için `gh auth setup-git` + `git push origin main` |
| Supabase `dgjfyewgrukglsehyntc` | Şema + seed (ör. **427** okul) |
| Vercel **cortexplus55 / burhancortexplus-app** | **Tek proje.** Canlı domain **`cortexplus.app`** + `www` 308, CLI link, preview'lar |
| Vercel **eski — kullanma** | `burhan55600-5553s-projects/cortex-plus` → **cortex-plus-theta.vercel.app** |

> **Tek Vercel projesi kuralı.** Bir dönem aynı repoya dört proje bağlıydı
> (`burhancortexplus`, `cortexplus-prod`, `cortexplus-web` ve bu). Her push
> dördünü birden derliyordu ve `cortexplus-web`, Supabase anahtarları olmadan
> herkese açık şekilde yayındaydı — `robots.txt` indekslemeye açık, `noindex`
> yok. Üçü silindi. Yeni proje açmak yerine mevcut projeye ortam ekleyin.

### Supabase Auth (Dashboard → Authentication → URL Configuration)

- **Site URL:** `https://cortexplus.app`
- **Redirect URLs:** `https://cortexplus.app/**`, `http://localhost:3000/**`, `https://*.vercel.app/**`

## Vercel + GitHub (`cortexplus55`)

1. GitHub → [Vercel App](https://github.com/apps/vercel) → **Configure** → **`burhancortexplus`** erişimi.
2. [vercel.com/new](https://vercel.com/new) → team **cortexplus55** → Import **`cortexplus55/burhancortexplus`**.
3. **Root Directory:** `cortex-plus`
4. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (+ `.env.example`).

   **Zorunlu değerler (eski `gwqonggqzvavljguiryx` kullanma):**
   - `NEXT_PUBLIC_SUPABASE_URL=https://dgjfyewgrukglsehyntc.supabase.co`
   - Publishable key: Supabase Dashboard → Project **dgjfyewgrukglsehyntc** → Settings → API

## Supabase ↔ GitHub

Project **cortexplus-platform** (`dgjfyewgrukglsehyntc`) → Integrations → GitHub → **`cortexplus55/burhancortexplus`**.

## Hazır sinyalleri

- **`github hazır`** — push + Vercel import bitti; env + deploy doğrula  
- **`supabase cli hazır`** — `scripts/setup-supabase.ps1` (interaktif `supabase login`)  
- **`cli hazır`** — `scripts/setup-cli.ps1` + `scripts/verify-cli.ps1`
- **`astra plus hazır`** — Astra Plus audit
