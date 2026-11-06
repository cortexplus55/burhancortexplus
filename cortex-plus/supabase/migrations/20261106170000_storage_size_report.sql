-- 6 Kasım 2026 (yönetim paneli · Sistem Sağlığı): dosya deposunun boyutu, salt okunur, yalnız service_role.
--
-- storage_size_report(): Supabase Storage'daki dosyaların toplam boyutu ve kova başına dağılım. Ücretsiz planda
-- depo 1 GB; dolunca yükleme durur ve hiçbir ekran bunu göstermiyordu. Boyut `storage.objects.metadata->>'size'`
-- alanından (Storage'ın kendi yazdığı bayt sayısı). PostgREST `storage` şemasını açmadığı için sayım ancak bir
-- fonksiyonla yapılabiliyor. /admin/sistem okur; göç yoksa ekran "ölçülemedi" der, hiçbir şey düşmez.
--
-- Eklemeli: yeni fonksiyon, DROP yok, tablo değişmez.

CREATE OR REPLACE FUNCTION public.storage_size_report()
RETURNS jsonb AS $BODY$
  SELECT jsonb_build_object(
    'total_bytes', COALESCE((SELECT sum(COALESCE((o.metadata->>'size')::bigint, 0)) FROM storage.objects o), 0),
    'objects', (SELECT count(*) FROM storage.objects),
    'buckets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', b.bucket_id, 'bytes', b.bytes, 'objects', b.objects) ORDER BY b.bytes DESC)
      FROM (
        SELECT o.bucket_id, sum(COALESCE((o.metadata->>'size')::bigint, 0)) AS bytes, count(*) AS objects
        FROM storage.objects o
        GROUP BY o.bucket_id
      ) b
    ), '[]'::jsonb)
  );
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.storage_size_report() SET search_path = public, storage, pg_temp;
REVOKE ALL ON FUNCTION public.storage_size_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storage_size_report() TO service_role;
