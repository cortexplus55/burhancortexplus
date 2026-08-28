# Cortex Plus Platform

- **GitHub (tek kaynak):** https://github.com/cortexplus55/burhancortexplus
- **App path:** `cortex-plus/` (Vercel Root Directory)
- **Greenfield:** yeni Supabase + yeni Vercel; eski `cortex-plus` repo ve `gwqonggqzvavljguiryx` kullanılmaz
- **Bağlantı rehberi:** `docs/delivery/GREENFIELD-CONNECT.md`
- **CLI (Vercel / Supabase / gh):** `docs/delivery/CLI-CONNECT.md` — tek hedef; kurulum: `scripts/setup-cli.ps1`
- **Operasyon e-postası (tek):** **`cortexplus@cortexplus.app`** — panel, OAuth test, Squarespace, Gmail MCP, doküman; kişisel `@gmail.com` **yasak**. Ayrıntı: `docs/delivery/IDENTITY.md`, kural: `.cursor/rules/cortexplus-identity.mdc`

Kullanıcı **github hazır** dedikten sonra: Supabase proje oluştur, migration push, Vercel env, MCP `project_ref` güncelle.
