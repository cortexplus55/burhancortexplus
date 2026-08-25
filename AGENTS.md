# Cortex Plus Dev — agent / IDE

- **Supabase proje ref:** `gwqonggqzvavljguiryx` (cortex-plus-app, eu-central-1)
- **CLI:** `scripts/setup-supabase.ps1` — Dashboard ile aynı Supabase hesabı
- **MCP:** kök `.cursor/mcp.json` → `https://mcp.supabase.com/mcp?project_ref=gwqonggqzvavljguiryx`
- Uygulama kökü: `cortex-plus/` (`npm run dev`, migrations `supabase/migrations/`)

Uzaktan şema değişikliği: önce `supabase migration new`, sonra `db push` (link sonrası) veya MCP `apply_migration`.
