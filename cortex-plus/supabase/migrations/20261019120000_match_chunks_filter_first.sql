-- 19 Ekim 2026 (satışa hazırlık Faz 3.3): belge parça aramasını önce kullanıcının kendi parçalarına süz,
-- sonra tam (yaklaşık değil) kosinüs mesafesiyle sırala.
--
-- Ölçüm (canlı, EXPLAIN ANALYZE, en çok belgesi olan kullanıcı, 8 sonuç):
--   eski fonksiyon  ~720 ms, 9.980 tampon  (pg_stat_statements: ortalama 277 ms, 340 çağrı)
--   süz-sonra-sırala  41,6 ms, 5.066 tampon
-- Eski sorgu bütün kullanıcıların vektörleri üzerindeki ivfflat indeksine (lists=100, probes=1) yaslanıp
-- sonra kullanıcıya süzüyordu: hem yavaş hem eksik sonuç verebiliyordu. Bir öğrencinin parçaları birkaç
-- bin satır; tam mesafe hem doğru hem hızlı. `document_embeddings.chunk_id` indeksi yoktu (birleştirme
-- bütün tabloyu tarıyordu).
--
-- Eklemeli: indeks IF NOT EXISTS, fonksiyon aynı imza ve aynı yetkilerle değişir.

CREATE INDEX IF NOT EXISTS document_embeddings_chunk_id_idx
  ON public.document_embeddings (chunk_id);

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
  WITH mine AS MATERIALIZED (
    SELECT
      dc.id,
      dc.document_id,
      d.file_name,
      dc.content,
      dc.page_id,
      dc.chunk_index,
      de.embedding <=> p_query_embedding AS distance
    FROM public.documents d
    JOIN public.document_chunks dc ON dc.document_id = d.id
    JOIN public.document_embeddings de ON de.chunk_id = dc.id
    WHERE d.user_id = p_user_id
      AND d.deleted_at IS NULL
      AND (p_document_id IS NULL OR d.id = p_document_id)
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
  ORDER BY m.distance
  LIMIT GREATEST(1, LEAST(p_match_count, 20));
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.match_document_chunks(uuid, vector, integer, double precision, uuid)
  SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.match_document_chunks(uuid, vector, integer, double precision, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(uuid, vector, integer, double precision, uuid)
  TO service_role;
