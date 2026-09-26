-- Adaptive Phase 2: pilot targeting metadata on feature flags
ALTER TABLE public.feature_flags
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.feature_flags.metadata IS
  'Optional targeting, e.g. {"pilot_user_ids":["uuid",...]} — user is enabled even when global enabled=false.';
