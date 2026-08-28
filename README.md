# Cortex Plus Platform (greenfield)

Tek GitHub kaynağı → Supabase + Vercel aynı repoya bağlanır.

## Ana repo (tek kaynak)

| | |
|--|--|
| **GitHub** | [**cortexplus55/burhancortexplus**](https://github.com/cortexplus55/burhancortexplus) |
| **Yerel kök** | `Cortex-Plus-Dev` (masaüstü) |
| **Vercel Root Directory** | `cortex-plus` |
| **Supabase ref** | `dgjfyewgrukglsehyntc` |

Detay: `docs/delivery/GREENFIELD-CONNECT.md` · **CLI:** `docs/delivery/CLI-CONNECT.md` · `scripts/setup-cli.ps1`

## Repo

**GitHub (tek kaynak):** [`cortexplus55/burhancortexplus`](https://github.com/cortexplus55/burhancortexplus)  
**Uygulama kökü (Vercel Root Directory):** `cortex-plus`

## Senin adımların (bir kez)

1. **GitHub** — repoya erişimin olduğunu doğrula (private repo).
2. **Vercel** — [vercel.com](https://vercel.com) → team **cortexplus55** → Import **burhancortexplus** → Root Directory: **`cortex-plus`** → Deploy.  
   (İstersen agent `create_git_project` ile de bağlar; GitHub Vercel uygulamasına repo izni ver.)
3. **Supabase** — [supabase.com/dashboard](https://supabase.com/dashboard) → org **cortexplus55** → **New project** (veya agent MCP ile oluşturur).  
   → Project Settings → **Integrations → GitHub** → bu repoyu bağla (migrations/branching için).

Hazır olunca chat’e yaz: **「github hazır」** — agent yeni Supabase ref’i `config.toml` + `.env.example` + Vercel env + migration push ile tamamlar.

## Yerel geliştirme

```powershell
cd cortex-plus
npm install
copy .env.example .env.local
npm run dev
```

```powershell
cd ..
.\scripts\setup-supabase.ps1
```

## Eski kaynaklar

Önceki `cortex-plus` repo, `gwqonggqzvavljguiryx` ve eski Vercel projesi **kullanılmıyor**; yalnızca bu repo + yeni Supabase + yeni Vercel.
