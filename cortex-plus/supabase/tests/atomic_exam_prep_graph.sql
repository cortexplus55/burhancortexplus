-- Run on the verified Cortex project after the migration. All fixture writes roll back.
BEGIN;
DO $$
DECLARE
  v_user uuid;
  v_doc uuid;
  v_input jsonb;
  v_prep uuid;
  v_node uuid;
  v_attempt uuid;
  v_before bigint[];
  v_after bigint[];
  v_rejected boolean := false;
  v_result jsonb;
BEGIN
  SELECT user_id, id INTO v_user, v_doc FROM public.documents
    WHERE id = '71cd76fd-3ea2-4c4e-b6a0-d90b344ec937'
      AND status = 'completed' AND deleted_at IS NULL;
  IF v_user IS NULL THEN RAISE EXCEPTION 'test_document_unavailable'; END IF;
  v_input := jsonb_build_object('userId', v_user, 'documentId', v_doc,
    'title', 'Atomic rollback verification', 'examType', 'Okul', 'examDate', '2026-09-21',
    'topics', jsonb_build_array('Radyan'),
    'tasks', '[{"title":"Radyan","due_date":"2026-09-08","sort_order":0}]'::jsonb,
    'nodes', '[{"kind":"quiz","title":"Tanı","day_index":1,"sort_order":0,"status":"ready"},{"kind":"qa","title":"Ders","day_index":2,"sort_order":1,"status":"locked"},{"kind":"quiz","title":"Tekrar","day_index":3,"sort_order":2,"status":"locked"}]'::jsonb);
  SELECT ARRAY[(SELECT count(*) FROM public.study_plans), (SELECT count(*) FROM public.study_plan_tasks),
    (SELECT count(*) FROM public.exam_preps), (SELECT count(*) FROM public.exam_prep_topics),
    (SELECT count(*) FROM public.exam_prep_nodes), (SELECT count(*) FROM public.exam_prep_sessions)] INTO v_before;
  BEGIN
    PERFORM public.create_exam_prep_graph(jsonb_set(v_input, '{nodes,2,status}', '"invalid"'));
  EXCEPTION WHEN check_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'bad_child_accepted'; END IF;
  SELECT ARRAY[(SELECT count(*) FROM public.study_plans), (SELECT count(*) FROM public.study_plan_tasks),
    (SELECT count(*) FROM public.exam_preps), (SELECT count(*) FROM public.exam_prep_topics),
    (SELECT count(*) FROM public.exam_prep_nodes), (SELECT count(*) FROM public.exam_prep_sessions)] INTO v_after;
  IF v_before <> v_after THEN RAISE EXCEPTION 'partial_graph_left_behind'; END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.create_exam_prep_graph(jsonb_set(v_input, '{userId}', to_jsonb(gen_random_uuid())));
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'source_not_ready' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'foreign_source_accepted'; END IF;
  v_prep := public.create_exam_prep_graph(v_input);
  IF NOT EXISTS(SELECT 1 FROM public.exam_preps WHERE id=v_prep AND document_id=v_doc AND user_id=v_user)
    OR (SELECT count(*) FROM public.exam_prep_nodes WHERE exam_prep_id=v_prep) <> 3
    OR (SELECT count(*) FROM public.exam_prep_sessions WHERE exam_prep_id=v_prep) <> 1 THEN
    RAISE EXCEPTION 'graph_incomplete';
  END IF;
  SELECT id INTO v_node FROM public.exam_prep_nodes WHERE exam_prep_id=v_prep AND sort_order=0;
  INSERT INTO public.exam_prep_node_attempts(node_id, exam_prep_id, user_id, payload, total)
    VALUES(v_node, v_prep, v_user, '{"type":"quiz"}', 2) RETURNING id INTO v_attempt;
  v_result := public.complete_exam_prep_node(v_user, v_prep, v_node, v_attempt, 1, 2, '{}');
  IF (v_result->>'score')::integer <> 1 THEN RAISE EXCEPTION 'incorrect_score'; END IF;
  v_result := public.complete_exam_prep_node(v_user, v_prep, v_node, v_attempt, 2, 2, '{}');
  IF (v_result->>'score')::integer <> 1 THEN RAISE EXCEPTION 'retry_changed_score'; END IF;
  IF (SELECT status FROM public.exam_prep_nodes WHERE exam_prep_id=v_prep AND sort_order=1) <> 'ready'
    OR (SELECT status FROM public.exam_prep_nodes WHERE exam_prep_id=v_prep AND sort_order=2) <> 'locked' THEN
    RAISE EXCEPTION 'retry_changed_unlock';
  END IF;
  IF has_function_privilege('anon', 'public.create_exam_prep_graph(jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.create_exam_prep_graph(jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.complete_exam_prep_node(uuid,uuid,uuid,uuid,integer,integer,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'public_write_privilege';
  END IF;
END;
$$;
ROLLBACK;
SELECT 'PASS: rollback, source ownership, full graph, repeat completion, function access; test data rolled back' AS result;
