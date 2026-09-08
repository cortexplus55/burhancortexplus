-- Apply before the application switches to this RPC. Existing rows are unchanged.
CREATE OR REPLACE FUNCTION public.create_exam_prep_graph(p_input jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := (p_input->>'userId')::uuid;
  v_document uuid := (p_input->>'documentId')::uuid;
  v_plan uuid;
  v_prep uuid;
BEGIN
  IF v_user IS NULL OR nullif(btrim(p_input->>'title'), '') IS NULL
     OR jsonb_typeof(p_input->'topics') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_input->'nodes') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_input->'tasks') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_graph';
  END IF;
  IF jsonb_array_length(p_input->'topics') = 0
     OR jsonb_array_length(p_input->'nodes') = 0 THEN
    RAISE EXCEPTION 'empty_graph';
  END IF;
  IF v_document IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.documents
    WHERE id = v_document AND user_id = v_user
      AND deleted_at IS NULL AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'source_not_ready';
  END IF;

  INSERT INTO public.study_plans(user_id, title, status)
  VALUES(v_user, p_input->>'title', 'active') RETURNING id INTO v_plan;

  INSERT INTO public.study_plan_tasks(plan_id, title, due_date, sort_order)
  SELECT v_plan, x.title, x.due_date, x.sort_order
  FROM jsonb_to_recordset(p_input->'tasks') AS x(title text, due_date date, sort_order integer);

  INSERT INTO public.exam_preps(user_id, exam_type, title, target_score, study_plan_id, exam_date, document_id)
  VALUES(v_user, p_input->>'examType', p_input->>'title',
    (p_input->>'targetScore')::integer, v_plan, (p_input->>'examDate')::date, v_document)
  RETURNING id INTO v_prep;

  INSERT INTO public.exam_prep_topics(exam_prep_id, label, sort_order, status)
  SELECT v_prep, value, (ordinality - 1)::integer, 'ready'
  FROM jsonb_array_elements_text(p_input->'topics') WITH ORDINALITY;

  INSERT INTO public.exam_prep_nodes(exam_prep_id, kind, title, day_index, sort_order, status)
  SELECT v_prep, x.kind, x.title, x.day_index, x.sort_order, x.status
  FROM jsonb_to_recordset(p_input->'nodes') AS x(kind text, title text, day_index integer, sort_order integer, status text);

  INSERT INTO public.exam_prep_sessions(exam_prep_id, user_id, status)
  VALUES(v_prep, v_user, 'active');
  RETURN v_prep;
END;
$$;

-- Only the authenticated server route may supply user IDs and write this graph.
REVOKE ALL ON FUNCTION public.create_exam_prep_graph(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_exam_prep_graph(jsonb) TO service_role;

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
  -- Serialize completions within a preparation; all changes commit together.
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
      FROM (SELECT status, CASE kind WHEN 'written_exam' THEN 4 WHEN 'oral' THEN 3
        WHEN 'quiz' THEN 2 WHEN 'qa' THEN 2 WHEN 'true_false' THEN 2 WHEN 'gaps' THEN 2 ELSE 1 END AS weight
        FROM public.exam_prep_nodes WHERE exam_prep_id = p_prep_id) weighted
    ) WHERE id = p_prep_id;
  END IF;
  -- Repeated requests return the stored result without unlocking further nodes.
  SELECT id INTO v_next FROM public.exam_prep_nodes
    WHERE exam_prep_id = p_prep_id AND sort_order > v_node.sort_order
    ORDER BY sort_order, id LIMIT 1;
  SELECT * INTO v_attempt FROM public.exam_prep_node_attempts WHERE id = p_attempt_id;
  RETURN jsonb_build_object('score', v_attempt.score, 'total', v_attempt.total, 'nextId', v_next);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_exam_prep_node(uuid, uuid, uuid, uuid, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_exam_prep_node(uuid, uuid, uuid, uuid, integer, integer, jsonb) TO service_role;
