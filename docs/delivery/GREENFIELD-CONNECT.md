# Greenfield bağlantı — GitHub → Vercel + Supabase

**Repo:** https://github.com/burhan55600-pixel/cortexplus-platform (private)  
**Uygulama dizini:** `cortex-plus`

## 1. GitHub (tamam)

Kod `main` dalında. `.env.local` repoda **yok**.

## 2. Vercel — GitHub import

1. https://vercel.com/new  
2. **Import Git Repository** → `burhan55600-pixel/cortexplus-platform`  
   - GitHub uygulamasına bu repo için izin ver.  
3. **Root Directory:** `cortex-plus`  
4. Framework: Next.js (otomatik)  
5. Environment Variables: şimdilik boş bırakılabilir; Supabase projesi oluşunca agent doldurur.  
6. Deploy.

Alternatif: agent `create_git_project` (Vercel MCP) — GitHub ↔ Vercel OAuth hazır olmalı.

## 3. Supabase — yeni proje + GitHub

1. https://supabase.com/dashboard/org/jyyksppawhechqznqjcg  
2. **New project** (ör. ad: `cortexplus-platform`, region: `eu-central-1`)  
3. Project → **Settings → Integrations → GitHub** → `cortexplus-platform` reposunu bağla  
4. **Database → Migrations** veya CLI: repodaki `cortex-plus/supabase/migrations` uygulanacak

Agent MCP ile de proje açabilir; maliyet onayı gerekir.

## 4. Sen hazır olunca

Chat’e yaz: **`github hazır`**

Agent:
- Yeni Supabase ref + URL/keys → `.env.example` notları, `config.toml`, Vercel env  
- `supabase db push` / MCP migrations  
- İlk deploy doğrulama

## Eski kaynaklar (kullanma)

| Eski | Yeni |
|------|------|
| `burhan55600-pixel/cortex-plus` | **cortexplus-platform** |
| Supabase `gwqonggqzvavljguiryx` | Yeni proje ref |
| Eski Vercel `cortex-plus` | Yeni Vercel proje (aynı repo) |
