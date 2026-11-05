-- Görünümler de tarayıcıdan yazılmaz (6 Kasım 2026, 20261106120000'in tamamlayıcısı).
-- İlk göçün döngüsü yalnız tabloları (relkind r, p) dolaşıyordu; canlıda `topic_content_coverage`
-- görünümünde anon ve authenticated için yazma izni kaldı. Görünüm security_invoker ve altındaki
-- tablonun politikası yok, yani yazım zaten düşüyordu; izin yine de kapanır. Yalnız izin kısma.
DO $$
DECLARE
  v text;
BEGIN
  FOR v IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', v);
  END LOOP;
END $$;
