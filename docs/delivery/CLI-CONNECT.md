# CLI bağlantıları (tek kaynak)

Yerel geliştirmede **yalnızca** bu hedefler kullanılır. Eski `burhan55600-5553s-projects/cortex-plus` (theta) ve kişisel Supabase org **kullanılmaz**.

| Araç | Hedef |
|------|--------|
| **Git** | https://github.com/cortexplus55/burhancortexplus |
| **GitHub CLI** | Aktif hesap: **`cortexplus55`** |
| **Vercel CLI** | Takım **`cortexplus55`**, proje **`burhancortexplus`** |
| **Supabase CLI** | Ref **`dgjfyewgrukglsehyntc`** (`cortex-plus/supabase`) |

## Vercel

| Alan | Değer |
|------|--------|
| Team slug | `cortexplus55` |
| Proje (CLI link) | `burhancortexplus` |
| Preview örnek | `burhancortexplus-pmhyowmgl-cortexplus55.vercel.app` |
| `orgId` | `team_7fZJmWjbQtKXSDwCZCA4s7Ym` |
| `projectId` | `prj_xd0PYMnQZnaz0Ksh0ksqIR8a9NEm` |
| Root Directory | `cortex-plus` (monorepo) |

**Canlı domain `cortexplus.app`:** ayrı Vercel projesi **`burhancortexplus-app`** (production env burada). Env çekmek için:

```powershell
cd cortex-plus
npx vercel env pull .env.vercel.local --scope cortexplus55 --project burhancortexplus-app
```

**İlk kurulum / yeniden link:**

```powershell
cd cortex-plus
npx vercel login          # cortexplus55 takımına erişimi olan hesap
.\scripts\setup-vercel-link.ps1
```

`cortex-plus/.vercel/project.json` repoda tutulur (yanlış projeye dönmesin diye).

## Supabase

| Alan | Değer |
|------|--------|
| Project ref | `dgjfyewgrukglsehyntc` |
| URL | `https://dgjfyewgrukglsehyntc.supabase.co` |
| Config | `cortex-plus/supabase/config.toml` |

**İlk kurulum (PowerShell, interaktif — tarayıcı açılır):**

```powershell
cd cortex-plus
npx supabase login      # Dashboard’da dgjfyewgrukglsehyntc gördüğün hesap
npx supabase init       # config.toml zaten varsa atlanır
npx supabase link --project-ref dgjfyewgrukglsehyntc
npx supabase migration list
```

Veya kökten: `.\scripts\setup-supabase.ps1`

**Cursor MCP:** `.cursor/mcp.json` → `project_ref=dgjfyewgrukglsehyntc`

CLI `projects list` içinde **dgjfyewgrukglsehyntc yoksa** yanlış Supabase hesabındasın → `supabase logout` + doğru hesapla `supabase login`.

## GitHub CLI

```powershell
gh auth status          # aktif: cortexplus55
gh auth switch          # gerekirse
git remote -v           # origin → cortexplus55/burhancortexplus
```

CI workflow push için bazen `burhan55600-pixel` + `workflow` scope — bkz. [GITHUB-CI-WORKFLOW-SCOPE.md](./GITHUB-CI-WORKFLOW-SCOPE.md).

**Migration drift — `db push` çalıştırmayın.** Sorun farklı timestamp değil:
iki geçmiş tamamen ayrık. 2026-09-02 ölçümü: repodaki **25** migration uzakta
kayıtlı değil, uzaktaki **34** kayıt repoda yok. Şema panel/MCP üzerinden
kurulmuş. `db push` 25 dosyayı zaten kurulu şemanın üstüne uygulamayı dener.
Şema değişikliğini SQL Editor’dan elle uygulayın; ayrıntı
[deploy-checklist.md](../../cortex-plus/docs/delivery/deploy-checklist.md#3-migrationlar).

## Hepsini doğrula

```powershell
.\scripts\verify-cli.ps1
```
