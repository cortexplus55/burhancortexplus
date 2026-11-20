-- Faz 2 (madde 7.4): hazırlık kurulumu aşamalı. İstek yalnız yol haritasını ve 1. ünitenin adımlarını yazar;
-- kalan düğüm/konu yazımı (ve kaynak çelişkisi yargısı) yanıttan sonra koşar. Kalan iş `exam_preps.setup_finish`
-- içinde durur: arka plan işi yarıda kesilirse (sunucusuz fonksiyonun ömrü bitti) hazırlık sayfası açılışında
-- kaldığı yerden yeniden başlatılır; iş bitince alan NULL olur.
-- Ekleyici ve tekrar çalıştırılabilir: yeni sütun NULL, var olan hazırlık etkilenmez; fonksiyon CREATE OR REPLACE.

ALTER TABLE public.exam_preps ADD COLUMN IF NOT EXISTS setup_finish jsonb;

COMMENT ON COLUMN public.exam_preps.setup_finish IS
  'Kurulumun arka plana bırakılan kalan işi (düğüm session_meta, konu alanları, çelişki girdisi). NULL: kurulum tamam.';

-- Kurulum yazımını tek gidiş-dönüşte yapar (eskiden düğüm başına bir UPDATE: ~900 istek).
-- p_nodes: [{ "sort_order": int, "meta": jsonb }]
-- p_topics: [{ "id": uuid, ...yalnız gönderilen alanlar yazılır }]
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
           THEN x.e->'contradictions' ELSE t.contradictions END
    FROM (SELECT e FROM jsonb_array_elements(coalesce(p_topics, '[]'::jsonb)) AS e) AS x
   WHERE t.exam_prep_id = p_prep_id
     AND t.id = (x.e->>'id')::uuid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_total + v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_exam_prep_setup(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_exam_prep_setup(uuid, uuid, jsonb, jsonb) TO service_role;
