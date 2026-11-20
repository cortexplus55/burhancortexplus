-- UYGULANDI: 21 Kasım 2026, #720 yayınından sonra (Supabase SQL ekranı + kayıt satırı; docs/operasyon/goc-kayitlari.md).
-- Faz 10 (20 Kasım 2026, ürün sahibinin kararı): yeni hazırlığın yolu az sayıda ANA ÜNİTEDEN kurulur; konu haritasının
-- bulduğu ince konular o ünitenin alt başlıklarıdır. `exam_prep_topics.subtopics` ünitenin alt başlıklarını taşır
-- (jsonb string[]). Eski satırlar boş dizi alır ve bugünkü gibi çalışır (alt başlıksız satır = eski konu).
--
-- Ekleyici ve tekrar çalıştırılabilir: yeni sütun varsayılanla gelir, hiçbir satır, ilerleme ya da hâkimiyet kaydı
-- değişmez. Kurulum yazımı (`apply_exam_prep_setup`) aynı imzayla yeniden tanımlanır; yalnız `subtopics` alanını da yazar
-- (gönderilmezse satırın değeri kalır). Kod göçten önce de çalışır: sütun yoksa alt başlıklar düğümlerin
-- `session_meta.lessonSubtopics` alanında durur, satır yazımı sütunu atlar.
--
-- Kayıt satırı (SQL ekranında aynı oturumda):
-- insert into supabase_migrations.schema_migrations (version, name)
-- values ('20261121120000', 'faz10_unite_alt_baslik') on conflict (version) do nothing;

ALTER TABLE public.exam_prep_topics
  ADD COLUMN IF NOT EXISTS subtopics jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.exam_prep_topics.subtopics IS
  'Ana ünitenin alt başlıkları (Faz 10). Boş dizi: eski model konu satırı.';

CREATE OR REPLACE FUNCTION public.apply_exam_prep_setup(
  p_prep_id uuid,
  p_user_id uuid,
  p_nodes jsonb DEFAULT '[]'::jsonb,
  p_topics jsonb DEFAULT '[]'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer := 0;
  v_rows integer := 0;
BEGIN
  -- Yalnız sunucu (service_role). SECURITY DEFINER içinde current_user sahibi gösterir; JWT rolü okunur.
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.exam_preps WHERE id = p_prep_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'prep_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.exam_prep_nodes n
     SET session_meta = x.meta
    FROM jsonb_to_recordset(coalesce(p_nodes, '[]'::jsonb)) AS x(sort_order integer, meta jsonb)
   WHERE n.exam_prep_id = p_prep_id
     AND n.sort_order = x.sort_order
     AND x.meta IS NOT NULL
     AND jsonb_typeof(x.meta) = 'object';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  UPDATE public.exam_prep_topics t
     SET document_topic_node_id = CASE WHEN x.e ? 'document_topic_node_id'
           THEN nullif(x.e->>'document_topic_node_id', '')::uuid ELSE t.document_topic_node_id END,
         familiarity = CASE WHEN x.e ? 'familiarity' THEN x.e->>'familiarity' ELSE t.familiarity END,
         measured_level = CASE WHEN x.e ? 'measured_level' THEN x.e->>'measured_level' ELSE t.measured_level END,
         diagnostic_status = CASE WHEN x.e ? 'diagnostic_status'
           THEN coalesce(x.e->>'diagnostic_status', t.diagnostic_status) ELSE t.diagnostic_status END,
         source_refs = CASE WHEN jsonb_typeof(x.e->'source_refs') = 'array' THEN x.e->'source_refs' ELSE t.source_refs END,
         contradictions = CASE WHEN jsonb_typeof(x.e->'contradictions') = 'array'
           THEN x.e->'contradictions' ELSE t.contradictions END,
         subtopics = CASE WHEN jsonb_typeof(x.e->'subtopics') = 'array' THEN x.e->'subtopics' ELSE t.subtopics END
    FROM (SELECT e FROM jsonb_array_elements(coalesce(p_topics, '[]'::jsonb)) AS e) AS x
   WHERE t.exam_prep_id = p_prep_id
     AND t.id = (x.e->>'id')::uuid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_total + v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_exam_prep_setup(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_exam_prep_setup(uuid, uuid, jsonb, jsonb) TO service_role;
