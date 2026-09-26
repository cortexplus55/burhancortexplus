-- Odaklı pratik, son kontrol ve hazırlık düğümleri.
-- Elle çalıştır: Supabase SQL editor.
-- Aynı tür varsa ikinci satır yazılmaz. Sınav oluşturma sihirbazına dokunmaz.
-- Uygulama da hazırlık sayfası açılınca aynı doldurmayı yapar; bu dosya
-- bütün hazırlıkları bir seferde günceller ve tamamlama ağırlığını hizalar.

CREATE OR REPLACE FUNCTION public.complete_exam_prep_node(
  p_user_id uuid, p_prep_id uuid, p_node_id uuid, p_attempt_id uuid,
  p_score integer, p_total integer, p_answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_node public.exam_prep_nodes%ROWTYPE;
  v_attempt public.exam_prep_node_attempts%ROWTYPE;
  v_next uuid;
BEGIN
  PERFORM 1 FROM public.exam_preps WHERE id = p_prep_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'prep_not_found'; END IF;
  SELECT * INTO v_node FROM public.exam_prep_nodes
    WHERE id = p_node_id AND exam_prep_id = p_prep_id FOR UPDATE;
  IF NOT FOUND OR v_node.status = 'locked' THEN RAISE EXCEPTION 'node_not_ready'; END IF;
  SELECT * INTO v_attempt FROM public.exam_prep_node_attempts
    WHERE id = p_attempt_id AND node_id = p_node_id
      AND exam_prep_id = p_prep_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active_attempt_required'; END IF;
  IF v_attempt.status = 'active' THEN
    IF p_score IS NULL OR p_total IS NULL OR p_total < 1 OR p_score < 0 OR p_score > p_total THEN
      RAISE EXCEPTION 'invalid_score';
    END IF;
    UPDATE public.exam_prep_node_attempts
      SET status = 'completed', score = p_score, total = p_total, answers = p_answers
      WHERE id = p_attempt_id;
    UPDATE public.exam_prep_nodes SET status = 'done' WHERE id = p_node_id;
    SELECT id INTO v_next FROM public.exam_prep_nodes
      WHERE exam_prep_id = p_prep_id AND sort_order > v_node.sort_order
      ORDER BY sort_order, id LIMIT 1;
    UPDATE public.exam_prep_nodes SET status = 'ready' WHERE id = v_next AND status = 'locked';
    UPDATE public.exam_preps SET readiness_score = (
      SELECT round(100.0 * sum(CASE WHEN status = 'done' THEN weight ELSE 0 END) / nullif(sum(weight), 0))
      FROM (SELECT status, CASE kind
        WHEN 'written_exam' THEN 4 WHEN 'oral' THEN 3
        WHEN 'quiz' THEN 2 WHEN 'qa' THEN 2 WHEN 'true_false' THEN 2
        WHEN 'gaps' THEN 2 WHEN 'focused' THEN 2 WHEN 'final_check' THEN 2
        ELSE 1 END AS weight
        FROM public.exam_prep_nodes WHERE exam_prep_id = p_prep_id) weighted
    ) WHERE id = p_prep_id;
  END IF;
  SELECT id INTO v_next FROM public.exam_prep_nodes
    WHERE exam_prep_id = p_prep_id AND sort_order > v_node.sort_order
    ORDER BY sort_order, id LIMIT 1;
  SELECT * INTO v_attempt FROM public.exam_prep_node_attempts WHERE id = p_attempt_id;
  RETURN jsonb_build_object('score', v_attempt.score, 'total', v_attempt.total, 'nextId', v_next);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_exam_prep_node(uuid, uuid, uuid, uuid, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_exam_prep_node(uuid, uuid, uuid, uuid, integer, integer, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.exam_path_insert_kind(
  p_prep uuid,
  p_kind text,
  p_title text,
  p_after text[]
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_anchor public.exam_prep_nodes%ROWTYPE;
  v_after text;
  v_sort integer;
  v_status text;
  v_passed boolean;
  v_meta jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.exam_prep_nodes
    WHERE exam_prep_id = p_prep AND kind = p_kind
  ) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_prep_nodes WHERE exam_prep_id = p_prep
  ) THEN
    RETURN;
  END IF;

  v_anchor := NULL;
  FOREACH v_after IN ARRAY p_after LOOP
    v_anchor := NULL;
    SELECT * INTO v_anchor
    FROM public.exam_prep_nodes
    WHERE exam_prep_id = p_prep AND kind = v_after
    ORDER BY sort_order DESC
    LIMIT 1;
    EXIT WHEN v_anchor.id IS NOT NULL;
  END LOOP;

  IF v_anchor.id IS NULL THEN
    SELECT * INTO v_anchor
    FROM public.exam_prep_nodes
    WHERE exam_prep_id = p_prep
    ORDER BY sort_order DESC
    LIMIT 1;
  END IF;

  v_meta := v_anchor.session_meta;
  IF v_meta IS NULL OR v_meta = '{}'::jsonb THEN
    v_meta := NULL;
    SELECT session_meta INTO v_meta
    FROM public.exam_prep_nodes
    WHERE exam_prep_id = p_prep
      AND session_meta IS NOT NULL
      AND session_meta <> '{}'::jsonb
    ORDER BY abs(sort_order - v_anchor.sort_order),
             CASE WHEN sort_order >= v_anchor.sort_order THEN 0 ELSE 1 END,
             sort_order
    LIMIT 1;
  END IF;
  IF v_meta IS NULL THEN
    v_meta := '{}'::jsonb;
  END IF;

  v_sort := v_anchor.sort_order + 1;
  SELECT EXISTS (
    SELECT 1 FROM public.exam_prep_nodes
    WHERE exam_prep_id = p_prep
      AND sort_order > v_anchor.sort_order
      AND status IN ('ready', 'done')
  ) INTO v_passed;

  IF v_passed OR v_anchor.status = 'done' THEN
    v_status := 'ready';
  ELSE
    v_status := 'locked';
  END IF;

  UPDATE public.exam_prep_nodes
  SET sort_order = sort_order + 1
  WHERE exam_prep_id = p_prep AND sort_order >= v_sort;

  INSERT INTO public.exam_prep_nodes (
    exam_prep_id, kind, title, day_index, sort_order, status, session_meta
  ) VALUES (
    p_prep, p_kind, p_title, v_anchor.day_index, v_sort, v_status, v_meta
  );
END;
$$;

DO $$
DECLARE
  prep uuid;
BEGIN
  FOR prep IN SELECT id FROM public.exam_preps LOOP
    PERFORM public.exam_path_insert_kind(prep, 'focused', 'Odaklı pratik', ARRAY['gaps', 'spaced', 'oral']);
    PERFORM public.exam_path_insert_kind(prep, 'final_check', 'Son kontrol', ARRAY['flashcards', 'written_exam']);
    PERFORM public.exam_path_insert_kind(prep, 'readiness', 'Hazırsın', ARRAY['final_check', 'flashcards']);
  END LOOP;
END $$;

DROP FUNCTION public.exam_path_insert_kind(uuid, text, text, text[]);
