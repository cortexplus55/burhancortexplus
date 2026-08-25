# Supabase CLI — proje bağlantısı

Proje ref: **`gwqonggqzvavljguiryx`** (cortex-plus-app, eu-central-1)

## Durum (2025-08-26)

| Yöntem | Sonuç |
|--------|--------|
| MCP (`list_migrations`, `execute_sql`, `get_advisors`) | Çalışıyor — şema + okul seed doğrulandı |
| Supabase **Dashboard** (cortex-plus-app) | Kullanıcı girişi yapıldı |
| `npx supabase projects list` (agent CLI) | **gwqonggqzvavljguiryx listede yok** — CLI oturumu farklı org/hesap (TUS Aİ CORTEX, PETMANİA, …) |
| `npx supabase link --project-ref gwqonggqzvavljguiryx` | **Başarısız** — privilege / proje görünürlüğü |

**Yapılacak:** Dashboard’a girdiğin **aynı Supabase hesabıyla** yerel PowerShell’de `npx supabase login`, ardından **cortexplus55 org** altında `gwqonggqzvavljguiryx` görünene kadar org üyeliğini kontrol et → `npx supabase link --project-ref gwqonggqzvavljguiryx`.

Uzak migration geçmişi repodaki dosya adlarından farklı versiyonlarla kayıtlı (panel/MCP ile uygulanmış parçalı migration’lar + `schools_expand_seed`). **Veritabanı güncel;** sorun yalnızca lokal CLI’nin `db push`/`db pull` senkronu.

## Sizin makinede bağlamak için

1. Supabase hesabınızın **cortex-plus-app** projesine Owner/Developer olduğundan emin olun.
2. Terminal (PowerShell):

```powershell
Set-Location "c:\Users\burha\OneDrive\Masaüstü\CORTEX PLUS Aİ CURSOR\cortex-plus"
npx supabase login
npx supabase link --project-ref gwqonggqzvavljguiryx
npx supabase migration list
```

3. `migration list` uzakta olup repoda olmayan `schools_expand_seed` gibi satırları gösterirse **`db push` çalıştırmayın** (no-op veya çakışma). Repoyu tek kaynak yapmak için önce `db pull` ile farkları inceleyin.

4. `supabase/config.toml` içinde `project_id` zaten ref ile hizalı — link başarılı olunca `.temp/project-ref` oluşur.

## MCP ile devam (CLI olmadan)

- Şema değişikliği: `apply_migration` veya SQL Editor
- Doğrulama: `execute_sql`, `get_advisors`
- Okul seed: bkz. `docs/delivery/schools-seed-verification.md`
