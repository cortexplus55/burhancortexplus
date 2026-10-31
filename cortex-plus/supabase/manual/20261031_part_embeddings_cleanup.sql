-- Göç DEĞİL: yalnız ürün sahibi, SQL ekranında elle çalıştırır (yıkıcı: satır siler).
--
-- 31 Ekim 2026: belge parçalarının (`documents.part_of`) eski gömme kopyaları. `20261031160000_part_search_parent`
-- uygulandıktan sonra arama bu satırları okumaz (parça aramaları ana belgenin aynı gömmelerini kullanır); kod
-- yayına çıktıktan sonra yenileri yazılmaz. Silinen yalnız parça gömmesidir: parçanın sayfaları ve parçaları
-- (metin) kalır, ana belgenin gömmelerine dokunulmaz.
--
-- Önce say (salt okuma):
--   select count(*) as part_embeddings,
--          pg_size_pretty(sum(pg_column_size(de.embedding))::bigint) as vector_bytes
--   from public.document_embeddings de
--   join public.document_chunks dc on dc.id = de.chunk_id
--   join public.documents d on d.id = dc.document_id
--   where d.part_of is not null;
--
-- Sonra sil:
delete from public.document_embeddings de
using public.document_chunks dc, public.documents d
where dc.id = de.chunk_id
  and d.id = dc.document_id
  and d.part_of is not null;
--
-- Not: Postgres silinen satırın yerini yeniden kullanır; veritabanı boyutu (pg_database_size) hemen küçülmez,
-- yeni gömmeler boşalan yere yazılır.
