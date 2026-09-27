-- Ders üretim hataları: kurucu paneli için sebep + çözücü izi.
-- Elle SQL yok; taslak metni / PII saklanmaz.
-- Geri alınabilir: DROP TABLE public.lesson_generation_failures;

CREATE TABLE IF NOT EXISTS public.lesson_generation_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  prep_id uuid,
  topic_id uuid,
  topic_label text,
  kind text,
  stage text,
  reason text NOT NULL,
  reasons text[] NOT NULL DEFAULT '{}'::text[],
  source_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lesson_generation_failures_created_idx
  ON public.lesson_generation_failures (created_at DESC);

CREATE INDEX IF NOT EXISTS lesson_generation_failures_reason_idx
  ON public.lesson_generation_failures (reason, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS lesson_generation_failures_prep_idx
  ON public.lesson_generation_failures (prep_id, created_at DESC)
  WHERE prep_id IS NOT NULL;

COMMENT ON TABLE public.lesson_generation_failures IS
  'Lesson generation failures: reason codes and resolver trace (no draft PII)';

ALTER TABLE public.lesson_generation_failures ENABLE ROW LEVEL SECURITY;

-- Servis rolü yazar (RLS bypass). Authenticated: yalnız is_admin() okur.
CREATE POLICY lesson_generation_failures_admin_select
  ON public.lesson_generation_failures
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Authenticated insert/update/delete yok — yazma yalnız service_role.
