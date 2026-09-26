-- Adaptive Learning Engine (additive). Existing exam_prep / mastery rows untouched.
-- Feature flags default OFF. No DROP of live tables.

-- ─── Topic mastery continuous fields ─────────────────────────────────────────
ALTER TABLE public.exam_prep_topic_mastery
  ADD COLUMN IF NOT EXISTS mastery numeric NOT NULL DEFAULT 0
    CHECK (mastery >= 0 AND mastery <= 1),
  ADD COLUMN IF NOT EXISTS mastery_confidence numeric NOT NULL DEFAULT 0
    CHECK (mastery_confidence >= 0 AND mastery_confidence <= 1),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unseen',
  ADD COLUMN IF NOT EXISTS review_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS streak_correct integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repeated_error_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_difficulty text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS behavior jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exam_prep_topic_mastery_status_check'
  ) THEN
    ALTER TABLE public.exam_prep_topic_mastery
      ADD CONSTRAINT exam_prep_topic_mastery_status_check
      CHECK (status IN (
        'unseen', 'introduced', 'learning', 'developing',
        'mastered', 'review_due', 'at_risk'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exam_prep_topic_mastery_difficulty_check'
  ) THEN
    ALTER TABLE public.exam_prep_topic_mastery
      ADD CONSTRAINT exam_prep_topic_mastery_difficulty_check
      CHECK (current_difficulty IN (
        'foundation', 'easy', 'medium', 'hard', 'exam_level'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS exam_prep_topic_mastery_review_due_idx
  ON public.exam_prep_topic_mastery (user_id, review_due_at)
  WHERE review_due_at IS NOT NULL;

-- ─── Prep-level adaptive markers ─────────────────────────────────────────────
ALTER TABLE public.exam_preps
  ADD COLUMN IF NOT EXISTS adaptive_policy_version text NOT NULL DEFAULT 'adaptive-v1',
  ADD COLUMN IF NOT EXISTS adaptive_plan_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adaptive_enabled_at timestamptz;

-- ─── Master plan version history ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.adaptive_master_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps (id) ON DELETE CASCADE,
  version integer NOT NULL,
  reason text NOT NULL DEFAULT 'initial',
  reason_copy text,
  schedule_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_prep_id, version)
);

CREATE INDEX IF NOT EXISTS adaptive_master_plans_prep_idx
  ON public.adaptive_master_plans (user_id, exam_prep_id, version DESC);

-- ─── Daily plans ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.adaptive_daily_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps (id) ON DELETE CASCADE,
  plan_date date NOT NULL,
  objective text NOT NULL DEFAULT '',
  estimated_minutes integer NOT NULL DEFAULT 0,
  master_plan_version integer,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exam_prep_id, plan_date)
);

CREATE TABLE IF NOT EXISTS public.adaptive_daily_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_plan_id uuid NOT NULL REFERENCES public.adaptive_daily_plans (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'other',
  title text NOT NULL,
  minutes integer NOT NULL DEFAULT 10,
  topic_id uuid,
  topic_key text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'done', 'skipped')),
  reason_code text,
  href text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adaptive_daily_plans_user_date_idx
  ON public.adaptive_daily_plans (user_id, plan_date DESC);

CREATE INDEX IF NOT EXISTS adaptive_daily_plan_items_plan_idx
  ON public.adaptive_daily_plan_items (daily_plan_id, sort_order);

-- ─── Learning sessions + events ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.adaptive_learning_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  planned_duration_minutes integer NOT NULL DEFAULT 45,
  objective text NOT NULL DEFAULT '',
  current_topic_id uuid,
  current_topic_key text,
  current_step integer NOT NULL DEFAULT 0,
  completion_pct numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'abandoned')),
  policy_version text NOT NULL DEFAULT 'adaptive-v1',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adaptive_learning_sessions_active_idx
  ON public.adaptive_learning_sessions (user_id, exam_prep_id, status)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.adaptive_learning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps (id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.adaptive_learning_sessions (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  topic_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS adaptive_learning_events_idem_idx
  ON public.adaptive_learning_events (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS adaptive_learning_events_session_idx
  ON public.adaptive_learning_events (session_id, created_at);

-- ─── Spaced reviews ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.adaptive_scheduled_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps (id) ON DELETE CASCADE,
  topic_key text NOT NULL,
  topic_id uuid,
  due_at timestamptz NOT NULL,
  interval_days integer NOT NULL DEFAULT 1,
  last_result text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'skipped', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adaptive_scheduled_reviews_due_idx
  ON public.adaptive_scheduled_reviews (user_id, exam_prep_id, due_at)
  WHERE status = 'pending';

-- ─── Jev decision audit ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.adaptive_jev_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps (id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.adaptive_learning_sessions (id) ON DELETE SET NULL,
  state_hash text NOT NULL,
  policy_version text NOT NULL DEFAULT 'adaptive-v1',
  provider text NOT NULL,
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric,
  probabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms integer,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  fallback_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adaptive_jev_decisions_prep_idx
  ON public.adaptive_jev_decisions (user_id, exam_prep_id, created_at DESC);

-- ─── Policy versions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.adaptive_policy_versions (
  key text PRIMARY KEY,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.adaptive_policy_versions (key, description, config)
VALUES (
  'adaptive-v1',
  'Initial adaptive learning policy: mastery, advance gates, Jev confidence, model routing.',
  '{
    "mastery": {
      "maxDelta": 0.12,
      "difficultyWeights": {"foundation":0.5,"easy":0.7,"medium":1.0,"hard":1.25,"exam_level":1.5},
      "independenceWeight": 1.2,
      "hintPenalty": 0.6,
      "transferBonus": 1.15,
      "retryPenalty": 0.75
    },
    "advance": {
      "masteryMin": 0.75,
      "confidenceMin": 0.65,
      "minEvidence": 4,
      "minIndependent": 2,
      "minMediumOrHard": 1
    },
    "jev": {
      "highConfidence": 0.85,
      "mediumConfidence": 0.65
    },
    "reviewIntervalsDays": [1, 3, 7, 14, 30]
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- ─── Feature flags (default OFF) ─────────────────────────────────────────────
INSERT INTO public.feature_flags (key, enabled, description)
VALUES
  (
    'adaptive_learning_enabled',
    false,
    'Adaptive Learning Engine: LearningGovernor, Student State, Çalışmaya Başla autopilot. Kapalıyken mevcut exam-prep yolu değişmez.'
  ),
  (
    'jev_enabled',
    false,
    'TypeSafe Jev decision engine. Kapalıyken veya hata halinde OpenAI structured fallback kullanılır.'
  ),
  (
    'adaptive_daily_replan_enabled',
    false,
    'Günlük planın adaptive replan policy ile sınırlı güncellenmesi.'
  ),
  (
    'adaptive_model_router_enabled',
    false,
    'TutorModelRouter: gpt-4o-mini varsayılan, gerekirse gpt-4o escalation.'
  )
ON CONFLICT (key) DO NOTHING;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.adaptive_master_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_daily_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_learning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_scheduled_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_jev_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_policy_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS adaptive_master_plans_select_own ON public.adaptive_master_plans;
CREATE POLICY adaptive_master_plans_select_own
  ON public.adaptive_master_plans FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS adaptive_daily_plans_select_own ON public.adaptive_daily_plans;
CREATE POLICY adaptive_daily_plans_select_own
  ON public.adaptive_daily_plans FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS adaptive_daily_plan_items_select_own ON public.adaptive_daily_plan_items;
CREATE POLICY adaptive_daily_plan_items_select_own
  ON public.adaptive_daily_plan_items FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS adaptive_learning_sessions_select_own ON public.adaptive_learning_sessions;
CREATE POLICY adaptive_learning_sessions_select_own
  ON public.adaptive_learning_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS adaptive_learning_events_select_own ON public.adaptive_learning_events;
CREATE POLICY adaptive_learning_events_select_own
  ON public.adaptive_learning_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS adaptive_scheduled_reviews_select_own ON public.adaptive_scheduled_reviews;
CREATE POLICY adaptive_scheduled_reviews_select_own
  ON public.adaptive_scheduled_reviews FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS adaptive_jev_decisions_select_own ON public.adaptive_jev_decisions;
CREATE POLICY adaptive_jev_decisions_select_own
  ON public.adaptive_jev_decisions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Policy versions are read-only config for authenticated users (no PII).
DROP POLICY IF EXISTS adaptive_policy_versions_select ON public.adaptive_policy_versions;
CREATE POLICY adaptive_policy_versions_select
  ON public.adaptive_policy_versions FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE public.adaptive_master_plans IS
  'Versioned master plan snapshots; never delete prior versions on replan.';
COMMENT ON TABLE public.adaptive_learning_events IS
  'Session event log; idempotency_key prevents double mastery updates.';
COMMENT ON TABLE public.adaptive_jev_decisions IS
  'Decision audit: provider, confidence, fallback — no full PDF content.';
