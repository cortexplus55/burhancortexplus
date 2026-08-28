# Supabase CLI — proje bağlantısı

> **Aktif proje:** `dgjfyewgrukglsehyntc` (cortexplus-platform, eu-central-1)  
> **GitHub:** https://github.com/cortexplus55/burhancortexplus  
> **CLI özeti:** [CLI-CONNECT.md](../../../docs/delivery/CLI-CONNECT.md)

Proje ref: **`dgjfyewgrukglsehyntc`**

## Kurulum (PowerShell, interaktif)

Dashboard’da **dgjfyewgrukglsehyntc** gördüğün **aynı Supabase hesabı** ile:

```powershell
cd cortex-plus
npx supabase login
npx supabase init          # config.toml varsa atlanir
npx supabase link --project-ref dgjfyewgrukglsehyntc
npx supabase migration list
```

Veya kökten: `.\scripts\setup-supabase.ps1`

**Yanlış hesap belirtisi:** `projects list` içinde ref yok veya link/migration **403**.

Cursor MCP: `.cursor/mcp.json` → `project_ref=dgjfyewgrukglsehyntc`
