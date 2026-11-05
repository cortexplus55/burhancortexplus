-- Lansman zırhı (5 Kasım 2026): belge tekilleştirme (SHA-256), soğuk vektör tahliyesi, sigorta ve tahliye anahtarları.
-- Yalnız ekleme; DROP POLICY yok. SQL ekranında uygulanır, ardından schema_migrations satırı yazılır.

-- 1) Belgenin dosya özeti: aynı dosya ikinci kez okunmaz (Vision/OCR ve gömme ücreti harcanmaz), içerik kopyalanır.
alter table public.documents add column if not exists sha256 text;
-- 2) Soğuk bellek: gömmeleri tahliye edilen belge; öğrenci hazırlığı açınca yeniden indekslenir.
alter table public.documents add column if not exists embeddings_evicted_at timestamptz;

create index if not exists documents_sha256_source_idx
  on public.documents (sha256)
  where sha256 is not null and status = 'completed' and part_of is null and deleted_at is null;

create index if not exists documents_embeddings_evicted_idx
  on public.documents (embeddings_evicted_at)
  where embeddings_evicted_at is not null;

-- 3) İçerik klonu: kaynağın sayfaları, parçaları ve gömmeleri hedefe kopyalanır (model çağrısı yok).
--    Sayfalar sayfa numarasıyla, parçalar chunk_index ile eşlenir; hedefin eski içeriği önce silinir.
create or replace function public.clone_document_content(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pages integer := 0;
  v_chunks integer := 0;
  v_embeddings integer := 0;
begin
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'clone_document_content: invalid arguments';
  end if;

  delete from public.document_embeddings
   where chunk_id in (select id from public.document_chunks where document_id = p_target);
  delete from public.document_chunks where document_id = p_target;
  delete from public.document_pages where document_id = p_target;

  insert into public.document_pages (
    document_id, page_number, text_content, extraction_ok, page_kind, headings, formulas, tables_detected,
    images_detected, uncertain_regions, extraction_method, char_count, clean_text, clean_model, cleaned_at)
  select p_target, page_number, text_content, extraction_ok, page_kind, headings, formulas, tables_detected,
         images_detected, uncertain_regions, extraction_method, char_count, clean_text, clean_model, cleaned_at
    from public.document_pages
   where document_id = p_source;
  get diagnostics v_pages = row_count;

  insert into public.document_chunks (document_id, page_id, chunk_index, content, token_count)
  select p_target, tp.id, sc.chunk_index, sc.content, sc.token_count
    from public.document_chunks sc
    left join public.document_pages sp on sp.id = sc.page_id
    left join public.document_pages tp on tp.document_id = p_target and tp.page_number = sp.page_number
   where sc.document_id = p_source;
  get diagnostics v_chunks = row_count;

  insert into public.document_embeddings (chunk_id, embedding)
  select tc.id, se.embedding
    from public.document_embeddings se
    join public.document_chunks sc on sc.id = se.chunk_id and sc.document_id = p_source
    join public.document_chunks tc on tc.document_id = p_target and tc.chunk_index = sc.chunk_index;
  get diagnostics v_embeddings = row_count;

  return jsonb_build_object('pages', v_pages, 'chunks', v_chunks, 'embeddings', v_embeddings);
end;
$$;

revoke all on function public.clone_document_content(uuid, uuid) from public, anon, authenticated;
grant execute on function public.clone_document_content(uuid, uuid) to service_role;

-- 4) Anahtarlar: tahliye kapatılabilir; sigortanın tavanı kokpitten yazılır (metadata.cap_usd).
insert into public.feature_flags (key, enabled, description)
values ('vector_eviction', true, 'Soğuk hazırlıkların belge gömmeleri günlük bakımda tahliye edilir; açılınca yeniden indekslenir.')
on conflict (key) do nothing;

insert into public.feature_flags (key, enabled, description)
values ('admin_ai_daily_cap', true, 'Küresel günlük OpenAI harcama sigortası: metadata.cap_usd (kurucu kokpitten yazar; yoksa ortam/varsayılan 25 $).')
on conflict (key) do nothing;
