-- Stage 7: generation/validation latency + failure reasons (no draft PII).

CREATE TABLE IF NOT EXISTS public.ai_validation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action_code text NOT NULL,
  activity_kind text,
  outcome text NOT NULL
    CHECK (outcome IN ('accepted', 'rejected', 'validator_unavailable')),
  failed_stage text,
  failure_codes text[] NOT NULL DEFAULT '{}'::text[],
  generation_ms integer NOT NULL DEFAULT 0,
  validation_ms integer NOT NULL DEFAULT 0,
  stages_ms jsonb NOT NULL DEFAULT '{}'::jsonb,
  repair_attempted boolean NOT NULL DEFAULT false,
  recheck_passed boolean,
  reservation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_validation_events_created_idx
  ON public.ai_validation_events (created_at DESC);

CREATE INDEX IF NOT EXISTS ai_validation_events_action_idx
  ON public.ai_validation_events (action_code, outcome, created_at DESC);

COMMENT ON TABLE public.ai_validation_events IS
  'Stage 7 validation metrics: timings and failure codes only (no prompts/drafts)';

ALTER TABLE public.ai_validation_events ENABLE ROW LEVEL SECURITY;

-- No authenticated policies: service role writes; admins read via service.
