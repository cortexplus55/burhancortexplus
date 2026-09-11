-- One transaction; never remove nodes with saved attempts.
CREATE OR REPLACE FUNCTION public.replace_exam_prep_schedule(
  p_user_id uuid, p_prep_id uuid, p_expected_schedule jsonb,
  p_expected_nodes jsonb, p_preserved_ids uuid[], p_schedule jsonb,
  p_settings jsonb, p_nodes jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_schedule jsonb;
  v_snapshot jsonb;
  v_node jsonb;
  v_ready boolean;
BEGIN
  SELECT schedule_v2 INTO v_schedule FROM public.exam_preps
    WHERE id = p_prep_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'prep_not_found'; END IF;
  IF v_schedule IS DISTINCT FROM p_expected_schedule THEN
    RAISE EXCEPTION 'stale_schedule';
  END IF;
  -- Locks also serialize with attempt inserts via the node foreign key.
  PERFORM id FROM public.exam_prep_nodes WHERE exam_prep_id = p_prep_id
    ORDER BY id FOR UPDATE;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'sort_order', sort_order, 'status', status, 'session_meta', session_meta
  ) ORDER BY id), '[]'::jsonb) INTO v_snapshot
  FROM public.exam_prep_nodes WHERE exam_prep_id = p_prep_id;
  IF v_snapshot IS DISTINCT FROM (
    SELECT COALESCE(jsonb_agg(value ORDER BY value->>'id'), '[]'::jsonb)
    FROM jsonb_array_elements(p_expected_nodes)
  ) THEN RAISE EXCEPTION 'stale_nodes'; END IF;
  IF p_preserved_ids IS NULL OR jsonb_typeof(p_nodes) <> 'array' THEN
    RAISE EXCEPTION 'invalid_schedule';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_preserved_ids) AS x(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.exam_prep_nodes n
      WHERE n.id = x.id AND n.exam_prep_id = p_prep_id)) THEN
    RAISE EXCEPTION 'invalid_preserved_node';
  END IF;
  IF EXISTS (SELECT 1 FROM public.exam_prep_nodes n
    WHERE n.exam_prep_id = p_prep_id AND NOT (n.id = ANY(p_preserved_ids))
    AND (n.status = 'done' OR EXISTS (SELECT 1 FROM public.exam_prep_node_attempts a WHERE a.node_id = n.id))) THEN
    RAISE EXCEPTION 'started_node_changed';
  END IF;

  UPDATE public.exam_preps SET
    exam_date = (p_settings->>'exam_date')::date,
    daily_minutes = (p_settings->>'daily_minutes')::integer,
    study_days = p_settings->'study_days',
    hard_topics_self = CASE WHEN p_settings ? 'hard_topics_self'
      THEN p_settings->'hard_topics_self' ELSE hard_topics_self END,
    learning_preferences = CASE WHEN p_settings ? 'learning_preferences'
      THEN p_settings->'learning_preferences' ELSE learning_preferences END,
    schedule_v2 = p_schedule
    WHERE id = p_prep_id;
  DELETE FROM public.exam_prep_nodes WHERE exam_prep_id = p_prep_id
    AND NOT (id = ANY(p_preserved_ids));
  SELECT EXISTS (SELECT 1 FROM public.exam_prep_nodes
    WHERE exam_prep_id = p_prep_id AND status = 'ready') INTO v_ready;
  FOR v_node IN SELECT value FROM jsonb_array_elements(p_nodes) LOOP
    INSERT INTO public.exam_prep_nodes(exam_prep_id, kind, title, day_index, sort_order, status, session_meta)
    VALUES(p_prep_id, v_node->>'kind', v_node->>'title',
      (v_node->>'day_index')::integer, (v_node->>'sort_order')::integer,
      CASE WHEN v_ready THEN 'locked' ELSE 'ready' END, v_node->'session_meta');
    v_ready := true;
  END LOOP;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_exam_prep_schedule(uuid,uuid,jsonb,jsonb,uuid[],jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_exam_prep_schedule(uuid,uuid,jsonb,jsonb,uuid[],jsonb,jsonb,jsonb) TO service_role;
