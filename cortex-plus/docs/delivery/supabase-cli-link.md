# Supabase CLI — proje bağlantısı

> **Aktif proje:** `dgjfyewgrukglsehyntc` (cortexplus-platform, eu-central-1)  
> **GitHub:** https://github.com/cortexplus55/burhancortexplus

Proje ref: **`dgjfyewgrukglsehyntc`**

## Durum

| Adım | Sonuç |
|------|--------|
| Dashboard MCP migrations | Uygulandı (greenfield) |
| `npx supabase link --project-ref dgjfyewgrukglsehyntc` | Dashboard ile **aynı hesap** gerekir |

**Yapılacak:** Dashboard’a girdiğin **aynı Supabase hesabıyla** yerel PowerShell’de `npx supabase login`, ardından:

```powershell
cd cortex-plus
npx supabase link --project-ref dgjfyewgrukglsehyntc
npx supabase migration list
```

Veya kökten: `.\scripts\setup-supabase.ps1`

Cursor MCP: `.cursor/mcp.json` → `https://mcp.supabase.com/mcp?project_ref=dgjfyewgrukglsehyntc`
