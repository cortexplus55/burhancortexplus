-- 31 Ekim 2026 (lansman zırhı): belge parçaları (baş kopyası, pencere kopyaları; `documents.part_of`) gömme
-- kopyalamaz, aramada ana belgenin gömmeleri parçanın sayfa aralığında kullanılır.
--
-- Ölçüm (canlı, 31 Ekim): 15 kullanıcı, 198 belge, veritabanı 154 MB / ücretsiz plan 500 MB; gömmeler 85 MB.
-- Pencereli işleme her kalan pencereyi (sayfa, parça, gömme) ana belgeden kopyalıyordu: 50 sayfadan büyük her
-- PDF'in gömmeleri iki kez duruyordu (722 parça gömmesi). Bir gömme satırı indeksiyle ~16 KB.
--
-- Davranış:
--   * p_document_id bir parçaysa: ana belgenin parçaları, yalnız parçanın sayfa aralığında (kendi sayfalarının
--     en küçük..en büyük numarası) aranır; sonuç parçanın kimliğiyle döner (çağıran tarafın gruplaması değişmez).
--   * p_document_id bir ana belgeyse ya da parçası yoksa: bugünkü gibi.
--   * p_document_id boşsa (kullanıcının bütün belgeleri): parçalar atlanır; ana belgeyle aynı sonucu iki kez
--     döndürüyorlardı.
--
-- Uygulama sırası: bu göç koddan ÖNCE. Göç uygulanınca eski kodun kopyaladığı parça gömmeleri artık okunmaz
-- (sonuç aynı: aynı sayfaların aynı gömmeleri). Kod parça gömmesi yazmayı bıraktıktan sonra eski parça gömmeleri
-- `supabase/maintenance/20261031_part_embeddings_cleanup.sql` ile silinebilir (yalnız ürün sahibi çalıştırır).
--
-- Eklemeli: aynı imza, aynı yetkiler, DROP yok.

CREATE OR REPLACE FUNCTION public.match_document_chunks(
  p_user_id uuid,
  p_query_embedding vector(1536),
  p_match_count integer DEFAULT 5,
  p_min_similarity double precision DEFAULT 0,
  p_document_id uuid DEFAULT NULL
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  file_name text,
  content text,
  similarity double precision,
  page_number integer,
  chunk_index integer
) AS $BODY$
  WITH target AS MATERIALIZED (
    SELECT
      d.id AS asked_id,
      COALESCE(d.part_of, d.id) AS search_id,
      CASE WHEN d.part_of IS NULL THEN NULL
        ELSE (SELECT min(p.page_number) FROM public.document_pages p WHERE p.document_id = d.id) END AS page_from,
      CASE WHEN d.part_of IS NULL THEN NULL
        ELSE (SELECT max(p.page_number) FROM public.document_pages p WHERE p.document_id = d.id) END AS page_to
    FROM public.documents d
    WHERE p_document_id IS NOT NULL
      AND d.id = p_document_id
      AND d.user_id = p_user_id
      AND d.deleted_at IS NULL
  ),
  mine AS MATERIALIZED (
    SELECT
      dc.id,
      COALESCE(t.asked_id, dc.document_id) AS document_id,
      d.file_name,
      dc.content,
      dc.page_id,
      dc.chunk_index,
      t.page_from,
      t.page_to,
      de.embedding <=> p_query_embedding AS distance
    FROM public.documents d
    JOIN public.document_chunks dc ON dc.document_id = d.id
    JOIN public.document_embeddings de ON de.chunk_id = dc.id
    LEFT JOIN target t ON t.search_id = d.id
    WHERE d.user_id = p_user_id
      AND d.deleted_at IS NULL
      AND (
        (p_document_id IS NULL AND d.part_of IS NULL)
        OR (p_document_id IS NOT NULL AND t.search_id IS NOT NULL)
      )
  )
  SELECT
    m.id,
    m.document_id,
    m.file_name,
    m.content,
    1 - m.distance AS similarity,
    dp.page_number,
    m.chunk_index
  FROM mine m
  LEFT JOIN public.document_pages dp ON dp.id = m.page_id
  WHERE (1 - m.distance) >= p_min_similarity
    AND (m.page_from IS NULL OR dp.page_number BETWEEN m.page_from AND m.page_to)
  ORDER BY m.distance
  LIMIT GREATEST(1, LEAST(p_match_count, 20));
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.match_document_chunks(uuid, vector, integer, double precision, uuid)
  SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.match_document_chunks(uuid, vector, integer, double precision, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(uuid, vector, integer, double precision, uuid)
  TO service_role;
