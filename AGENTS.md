# Cortex Plus Platform

## TEK KAYNAK — başka hiçbir yer yok

| | Değer |
|---|---|
| **Repo** | `cortexplus55/burhancortexplus` — **tek repo** |
| **Yerel klasör** | `C:\Users\burha\OneDrive\Masaüstü\Cortex-Plus-Dev` |
| **Vercel** | scope `cortexplus55` → proje `burhancortexplus-app` → `cortexplus.app` (Root Directory: `cortex-plus/`) |
| **Supabase** | `dgjfyewgrukglsehyntc` |
| **GitHub hesabı** | `cortexplus55` (repoya `git config --local` ile sabitlendi) |

"Commit et" / "deploy et" denince gidilecek yer budur. Başka repo, başka klasör,
başka Supabase projesi **yok**. Bir tanesini gördüğünüzde bu dosyaya geri dönün.

**Kullanılmayacaklar:** `burhan55600-pixel/*` (GitHub'dan silindi),
`burhan55600-5553s-projects/*`, Supabase `gwqonggqzvavljguiryx` (emekli),
`nslhmgbicczkrcjwmdix` (duraklatılmış).

> Doğrulama sırası — bir daha yanlış hedefe çalışmamak için:
> 1. `cortexplus.app` istemci paketinden Supabase ref'ini oku
> 2. Vercel'de hangi projenin hangi repoyu deploy ettiğine bak
> 3. Ancak ondan sonra kod veya şema değiştir

---

- **App path:** `cortex-plus/` (Vercel Root Directory)
- **Bağlantı rehberi:** `docs/delivery/GREENFIELD-CONNECT.md`
- **CLI (Vercel / Supabase / gh):** `docs/delivery/CLI-CONNECT.md` — tek hedef; kurulum: `scripts/setup-cli.ps1`
  - ⚠️ **Yerel `vercel` CLI yanlış hesapta oturumlu** (`burhan55600-5553s-projects` / BrhnOndr — yukarıdaki
    "kullanılmayacaklar" listesinde). Deploy için CLI'ya güvenmeyin: `git push origin main` zaten
    production deploy'unu tetikliyor, doğrulama Chrome'daki panelden yapılır.
  - Panel URL'i: `https://vercel.com/cortexplus55/burhancortexplus-app/deployments`
    (`cortexplus55s-projects` diye bir scope **yok**, 404 verir).
- **Operasyon e-postası (tek):** **`cortexplus@cortexplus.app`** — panel, OAuth test, Squarespace, Gmail MCP, doküman; kişisel `@gmail.com` **yasak**. Ayrıntı: `docs/delivery/IDENTITY.md`, kural: `.cursor/rules/cortexplus-identity.mdc`

Kullanıcı **github hazır** dedikten sonra: Supabase proje oluştur, migration push, Vercel env, MCP `project_ref` güncelle.

---

## Ürün yönü — Astra paritesi kuzey yıldızı DEĞİL

**Karar tarihi: 2026-09-04.** Astra AI bir referans; "Astra'da var, bizde yok"
tek başına yapılacak iş gerekçesi **değil**. Bir özellik ancak Cortex Plus
öğrencisine bir şey öğrettiği için yazılır.

`docs/astra-parity/` ve `docs/astra-audit/` **arşivdir** — iş listesi değil.
İçlerindeki "bizde yok" ve "kapatıldı ✓" satırları bayat; kullanmadan önce
koddan doğrulayın. Gerekçe: `docs/astra-parity/README.md`.

**Geri alınmış özellikler — yeniden yazmayın:** `13a175e` "Uygulamalar"
bölümünü tümüyle kaldırdı (34 simülasyon, 5 mini oyun, günün bulmacaları,
liderlik tablosu, AI uygulama üreteci). Yerine 12 araçlık `/araclar` geldi;
`/uygulamalar` kalıcı yönlendirme. Veritabanı tabloları (`lab_app_plays`,
`daily_puzzles`, `user_apps` …) bilerek duruyor — arayüz geri gelir, veri gelmez.
