-- Stage 8: generation/attempt lifecycle, idempotency keys, answer resume.
-- Additive. Legacy status 'active' kept (= ready to play).

ALTER TABLE public.exam_prep_node_attempts
  DROP CONSTRAINT IF EXISTS exam_prep_node_attempts_status_check;

ALTER TABLE public.exam_prep_node_attempts
  ADD CONSTRAINT exam_prep_node_attempts_status_check
  CHECK (status IN ('creating', 'active', 'failed', 'completed'));

ALTER TABLE public.exam_prep_node_attempts
  ADD COLUMN IF NOT EXISTS generation_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.exam_prep_node_attempts
  ADD COLUMN IF NOT EXISTS client_request_id text;

ALTER TABLE public.exam_prep_node_attempts
  ADD COLUMN IF NOT EXISTS complete_request_id text;

ALTER TABLE public.exam_prep_node_attempts
  ADD COLUMN IF NOT EXISTS content_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.exam_prep_node_attempts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.exam_prep_node_attempts.generation_id IS
  'Unique id for this content generation; stale writes must match';
COMMENT ON COLUMN public.exam_prep_node_attempts.client_request_id IS
  'Client start idempotency key; same key → same attempt, no second charge';
COMMENT ON COLUMN public.exam_prep_node_attempts.complete_request_id IS
  'Client complete idempotency key; double-submit returns stored score';
COMMENT ON COLUMN public.exam_prep_node_attempts.content_version IS
  'Optimistic lock for mid-session answer saves';
COMMENT ON COLUMN public.exam_prep_node_attempts.status IS
  'creating | active (ready) | failed | completed';

CREATE UNIQUE INDEX IF NOT EXISTS exam_prep_node_attempts_client_request_uidx
  ON public.exam_prep_node_attempts (user_id, node_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS exam_prep_node_attempts_generation_uidx
  ON public.exam_prep_node_attempts (generation_id);

CREATE INDEX IF NOT EXISTS exam_prep_node_attempts_active_resume_idx
  ON public.exam_prep_node_attempts (user_id, node_id, status, updated_at DESC)
  WHERE status IN ('creating', 'active');

CREATE TABLE IF NOT EXISTS public.exam_prep_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps (id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES public.exam_prep_nodes (id) ON DELETE CASCADE,
  attempt_id uuid REFERENCES public.exam_prep_node_attempts (id) ON DELETE SET NULL,
  client_request_id text NOT NULL,
  generation_id uuid NOT NULL,
  credit_idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating', 'ready', 'failed', 'completed')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, node_id, client_request_id),
  UNIQUE (generation_id)
);

CREATE INDEX IF NOT EXISTS exam_prep_generation_jobs_attempt_idx
  ON public.exam_prep_generation_jobs (attempt_id);

COMMENT ON TABLE public.exam_prep_generation_jobs IS
  'Stage 8 in-flight generation tracking; prevents double charge on retry';

ALTER TABLE public.exam_prep_generation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_prep_generation_jobs_select_own ON public.exam_prep_generation_jobs;
CREATE POLICY exam_prep_generation_jobs_select_own
  ON public.exam_prep_generation_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Persist mid-session answers with version + generation guard (service_role).
CREATE OR REPLACE FUNCTION public.save_exam_prep_node_answers(
  p_user_id uuid,
  p_attempt_id uuid,
  p_generation_id uuid,
  p_expected_version integer,
  p_answers jsonb,
  p_cursor_index integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.exam_prep_node_attempts%ROWTYPE;
  v_new_version integer;
BEGIN
  SELECT * INTO v_attempt
  FROM public.exam_prep_node_attempts
  WHERE id = p_attempt_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_not_found';
  END IF;

  IF v_attempt.status NOT IN ('creating', 'active') THEN
    RAISE EXCEPTION 'attempt_not_active';
  END IF;

  IF v_attempt.generation_id IS DISTINCT FROM p_generation_id THEN
    RAISE EXCEPTION 'stale_generation';
  END IF;

  IF v_attempt.content_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'stale_version';
  END IF;

  v_new_version := v_attempt.content_version + 1;

  UPDATE public.exam_prep_node_attempts
  SET
    answers = COALESCE(p_answers, '{}'::jsonb),
    content_version = v_new_version,
    updated_at = now(),
    answer_meta = CASE
      WHEN p_cursor_index IS NULL THEN answer_meta
      ELSE jsonb_set(
        COALESCE(answer_meta, '{}'::jsonb),
        '{cursorIndex}',
        to_jsonb(p_cursor_index),
        true
      )
    END
  WHERE id = p_attempt_id;

  RETURN jsonb_build_object(
    'ok', true,
    'contentVersion', v_new_version,
    'generationId', p_generation_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_exam_prep_node_answers(uuid, uuid, uuid, integer, jsonb, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_exam_prep_node_answers(uuid, uuid, uuid, integer, jsonb, integer)
  TO service_role;
