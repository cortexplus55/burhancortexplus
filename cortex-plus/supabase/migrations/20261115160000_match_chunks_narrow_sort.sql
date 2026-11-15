-- YAZILDI, UYGULANMADI: Burhan onayıyla SQL ekranında uygulanır (kayıt satırıyla); docs/operasyon/goc-kayitlari.md.
--
-- 15 Kasım 2026 (disk IO, Burhan kararı 7): belge aramasında geçici dosya yazımını kaldırır.
--
-- Ölçüm (pg_stat_statements, 15 Kasım; docs/operasyon/disk-io.md): `match_document_chunks` uygulamanın geçici dosya
-- yazan tek sorgusu; 2.740 çağrıda 43.372 temp blok (~355 MB), çağrı başına ~130 kB. Sebep 20261031160000'deki
-- `mine AS MATERIALIZED` CTE'si: kullanıcının BÜTÜN parçalarını `content` metni ve dosya adıyla birlikte belleğe
-- alıyor; 2 MB `work_mem`'i aşınca diske taşıyor. Sıralama yalnız ilk N'yi istediği halde bütün metin taşınıyor.
--
-- Yeni gövde: aday satırı dar (parça kimliği, belge kimliği, uzaklık). Sayfa aralığı (yalnız parça aramasında)
-- satır başına EXISTS ile sınanır, sıralama `ORDER BY uzaklık, kimlik LIMIT n` (en çok 20 satırlık yığın; diske
-- taşmaz). `content`, `chunk_index`, dosya adı ve sayfa numarası seçilen en çok 20 satıra SONRADAN birleşir.
-- Uzaklık satır başına bir kez hesaplanır: benzerlik eşiği (1 - uzaklık >= eşik) uzaklık sırasının bir ÖN EKİNİ
-- tuttuğu için LIMIT'ten sonra uygulanır; sonuç, önce süzüp sonra ilk N'yi almakla aynı.
--
-- Aynı imza, aynı dönüş, aynı sonuç (eşit uzaklıkta sıra artık kimliğe göre sabit; eskisinde belirsizdi). Benzerlik
-- eşiği, parça/ana belge kuralları, silinmiş belge ve başka kullanıcı süzgeci 20261031160000 ile birebir. Eşdeğerlik
-- PGlite'ta eski gövdeyle yan yana koşturularak sınandı: tests/unit/belge-arama-dar-siralama.test.ts.
--
-- Eklemeli: CREATE OR REPLACE, aynı yetkiler, DROP yok, tablo ya da satır değişmez.
-- Geri alma: 20261031160000_part_search_parent.sql dosyasının CREATE OR REPLACE bloğunu yeniden çalıştırmak.

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
  ranked AS (
    SELECT
      dc.id AS chunk_id,
      COALESCE(t.asked_id, dc.document_id) AS document_id,
      d.id AS source_id,
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
      AND (
        t.page_from IS NULL
        OR EXISTS (
          SELECT 1 FROM public.document_pages rp
          WHERE rp.id = dc.page_id
            AND rp.page_number BETWEEN t.page_from AND t.page_to
        )
      )
    ORDER BY distance, chunk_id
    LIMIT GREATEST(1, LEAST(p_match_count, 20))
  )
  SELECT
    r.chunk_id,
    r.document_id,
    d.file_name,
    dc.content,
    1 - r.distance AS similarity,
    dp.page_number,
    dc.chunk_index
  FROM ranked r
  JOIN public.document_chunks dc ON dc.id = r.chunk_id
  JOIN public.documents d ON d.id = r.source_id
  LEFT JOIN public.document_pages dp ON dp.id = dc.page_id
  WHERE (1 - r.distance) >= p_min_similarity
  ORDER BY r.distance, r.chunk_id;
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.match_document_chunks(uuid, vector, integer, double precision, uuid)
  SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.match_document_chunks(uuid, vector, integer, double precision, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(uuid, vector, integer, double precision, uuid)
  TO service_role;
