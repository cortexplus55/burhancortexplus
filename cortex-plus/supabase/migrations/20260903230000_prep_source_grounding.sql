-- ============================================================================
-- Kaynağa bağlanma
--
-- Denetimde çıkan en temel bulgu: sınav hazırlığı akışı yüklenen belgeyi hiç
-- okumuyordu. Podcast, quiz, sözlü, kart ve yazılı yalnızca sınav adı + konu
-- etiketi + zorluktan üretiliyordu. Öğrenci öğretmeninin notunu yüklüyor ama
-- ders internetin ortalama bilgisinden geliyordu.
--
-- İki değişiklik:
--   1) exam_preps.document_id — hazırlık bir kaynağa bağlanabiliyor.
--   2) match_document_chunks benzerlik eşiği ve belge filtresi alıyor.
--
-- Eşik hakkında dürüst not: ölçümde kaynak içi sorular 0,35-0,38 benzerlik
-- verdi, ama KAYNAK DIŞI ama ilgili sorular da (aktif taşıma, mitoz) 0,35-0,36
-- verdi. Yani eşik, "belgede olmayan ama konuya yakın" soruyu ayıramaz —
-- yalnızca tamamen alakasız olanı (0,20) eler. Kaynak dışına çıkıldığını
-- söyleme işi prompt'ta yapılıyor, burada değil.
--
-- Tamamen additive. Editör notu: satır sonunda çıplak THEN bırakmayın.
-- ============================================================================

-- --- 1) Hazırlığın kaynağı --------------------------------------------------
ALTER TABLE public.exam_preps ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS exam_preps_document_idx ON public.exam_preps (document_id);

-- --- 2) Arama: belge filtresi + benzerlik eşiği -----------------------------
-- Yeni parametreler varsayılanlı; eski 3 argümanlı çağrılar aynen çalışıyor.
-- Aşırı yükleme belirsizliği doğmasın diye eski imza düşürülüp yeniden
-- oluşturuluyor (fonksiyon, veri değil — düşürmek güvenli).
DROP FUNCTION IF EXISTS public.match_document_chunks(uuid, vector, integer);

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
  similarity double precision
) AS $BODY$
  SELECT dc.id, dc.document_id, d.file_name, dc.content, 1 - (de.embedding <=> p_query_embedding) AS similarity
  FROM public.document_embeddings de
  JOIN public.document_chunks dc ON dc.id = de.chunk_id
  JOIN public.documents d ON d.id = dc.document_id
  WHERE d.user_id = p_user_id AND d.deleted_at IS NULL AND (p_document_id IS NULL OR d.id = p_document_id) AND (1 - (de.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY de.embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(p_match_count, 20));
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.match_document_chunks(uuid, vector, integer, double precision, uuid) SET search_path = public, pg_temp;

-- Fonksiyon kullanıcı kimliğini parametre olarak alıyor; PostgREST üzerinden
-- açılırsa herhangi bir istemci başkasının belgelerini okuyabilir. Yalnızca
-- sunucu tarafı service role çağırabilir.
REVOKE ALL ON FUNCTION public.match_document_chunks(uuid, vector, integer, double precision, uuid) FROM PUBLIC, anon, authenticated;
