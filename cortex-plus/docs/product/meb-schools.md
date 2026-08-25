# Okul verisi (MEB) — Cortex Plus

## Mevcut durum

- Supabase `schools` tablosu: ad, il, ilçe, tür.
- Kayıt sihirbazı `/api/schools/search` ile arama yapar.
- İlk migration: 12 örnek okul; **`20250826130000_schools_expand.sql`**: 81 il × tipik okul adları (~400 kayıt).

## MEB resmi API

Türkiye’de tüm okulların açık, stabil ve ücretsiz bir **toplu REST API**’si yoktur. MEB verileri genelde:

- e-Okul / MEBBİS (yetkili kurum erişimi),
- veya periyodik CSV/Excel duyuruları (il müdürlükleri)

üzerinden dağıtılır.

## Önerilen entegrasyon (v2)

1. **CSV import:** `scripts/import-schools.ts` — sütunlar: `name`, `city`, `district`, `school_type`, `meb_code` (opsiyonel).
2. **Cron:** Yılda 1–2 kez manuel CSV güncellemesi (admin yükler → `schools` upsert).
3. **Arama:** `pg_trgm` + `ilike` (mevcut); büyük veride `search_vector` rank.

## `meb_code` (ileride)

Migration ile eklenebilir:

```sql
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS meb_code text UNIQUE;
```

Kayıtta `profiles.school_name` yanında `school_id` FK tutmak eşleşmeyi güçlendirir.

## Cortex vs Astra

Astra tarafında okul seçimi benzer arama UX’i hedeflenir; Cortex’te veri genişletildi, resmi MEB senkronu **operasyonel süreç** olarak dokümante edildi.
