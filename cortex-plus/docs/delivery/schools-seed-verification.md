# Okul seed doğrulama

**Proje:** `gwqonggqzvavljguiryx`  
**Tablo:** `public.schools`

## Son kontrol (agent — 2025-08-26)

| Metrik | Değer | Hedef |
|--------|-------|--------|
| Toplam kayıt | **397** | ~400+ |
| Artvin örneği | **5** kayıt | ≥1 |
| Farklı il | **81** | 81 |

Migration dosyası: `supabase/migrations/20250826130000_schools_expand.sql`  
Uzakta uygulanan: `schools_expand_seed` (MCP `apply_migration`)

## Yerel CLI (önerilen tam seed)

```powershell
cd cortex-plus
npx supabase@latest login
npx supabase@latest link --project-ref gwqonggqzvavljguiryx
npx supabase@latest db push --linked
```

## SQL ile hızlı doğrulama

```sql
SELECT count(*) AS total, count(DISTINCT city) AS cities FROM public.schools;
SELECT city, count(*) FROM public.schools GROUP BY city ORDER BY count DESC LIMIT 10;
SELECT name FROM public.schools WHERE city = 'Artvin';
```

`Artvin` için en az bir kayıt görünmüyorsa geniş seed tam uygulanmamış demektir — `db push` tekrarlayın.

## API smoke

```http
GET /api/schools/search?q=Ankara
GET /api/schools/search?q=Fen
```

Kayıt sihirbazında okul arama bu endpoint’i kullanır.
