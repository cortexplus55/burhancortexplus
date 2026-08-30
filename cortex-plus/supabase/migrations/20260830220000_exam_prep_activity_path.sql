-- Exam-prep activity path (video model): date-based nodes, not curriculum-as-path.

ALTER TABLE public.exam_preps
  ADD COLUMN IF NOT EXISTS exam_date date,
  ADD COLUMN IF NOT EXISTS active_topic_id uuid REFERENCES public.exam_prep_topics(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.exam_prep_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  day_index integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'locked'
    CHECK (status IN ('locked', 'ready', 'done')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_prep_nodes_prep_idx
  ON public.exam_prep_nodes (exam_prep_id, sort_order);

CREATE TABLE IF NOT EXISTS public.exam_prep_node_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL REFERENCES public.exam_prep_nodes(id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.exam_prep_topics(id) ON DELETE SET NULL,
  difficulty text NOT NULL DEFAULT 'orta',
  voice_mode boolean NOT NULL DEFAULT false,
  payload jsonb,
  score integer,
  total integer,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_prep_node_attempts_node_idx
  ON public.exam_prep_node_attempts (node_id, created_at DESC);

ALTER TABLE public.exam_prep_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_prep_node_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_prep_nodes_own ON public.exam_prep_nodes;
CREATE POLICY exam_prep_nodes_own ON public.exam_prep_nodes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.exam_preps p
      WHERE p.id = exam_prep_nodes.exam_prep_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS exam_prep_node_attempts_own ON public.exam_prep_node_attempts;
CREATE POLICY exam_prep_node_attempts_own ON public.exam_prep_node_attempts
  FOR ALL USING (user_id = auth.uid());
