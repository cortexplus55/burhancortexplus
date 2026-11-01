-- Resmî müfredat kayıt defteri (yalnız ekleme; mevcut tablolara dokunmaz).
-- Her veri satırı kaynağını taşır: source_url, program_version, sha256, fetched_at.
-- Veriler resmî MEB / ÖDSGM / ÖSYM / Diyanet belgelerinden ayrıştırılır;
-- ayrıştırılamayan kaynaklar curriculum_exclusions tablosunda raporlanır.

CREATE TABLE IF NOT EXISTS public.curriculum_sources (
  id text PRIMARY KEY,
  publisher text NOT NULL,
  title text NOT NULL,
  source_url text NOT NULL,
  program_version text NOT NULL,
  sha256 text NOT NULL,
  fetched_at timestamptz NOT NULL,
  page_url text
);

CREATE TABLE IF NOT EXISTS public.curriculum_programs (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('okul', 'yks')),
  grade integer,
  subject_key text NOT NULL,
  subject text NOT NULL,
  label text NOT NULL,
  badge text NOT NULL,
  scope text NOT NULL,
  source_ids text[] NOT NULL DEFAULT '{}',
  source_url text NOT NULL,
  program_version text NOT NULL,
  sha256 text NOT NULL,
  fetched_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.curriculum_units (
  id text PRIMARY KEY,
  program_id text NOT NULL REFERENCES public.curriculum_programs (id),
  title text NOT NULL,
  sort_order integer NOT NULL,
  source_url text NOT NULL,
  program_version text NOT NULL,
  sha256 text NOT NULL,
  fetched_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.curriculum_outcomes (
  id text PRIMARY KEY,
  program_id text NOT NULL REFERENCES public.curriculum_programs (id),
  unit_id text NOT NULL REFERENCES public.curriculum_units (id),
  code text NOT NULL,
  text text NOT NULL,
  topic text,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  quotas jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL,
  source_id text NOT NULL REFERENCES public.curriculum_sources (id),
  quota_source_id text REFERENCES public.curriculum_sources (id),
  text_similarity numeric,
  source_url text NOT NULL,
  program_version text NOT NULL,
  sha256 text NOT NULL,
  fetched_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS curriculum_outcomes_program ON public.curriculum_outcomes (program_id, sort_order);

CREATE TABLE IF NOT EXISTS public.curriculum_exam_scenarios (
  program_id text NOT NULL REFERENCES public.curriculum_programs (id),
  exam_key text NOT NULL,
  scenarios integer[] NOT NULL DEFAULT '{}',
  national boolean NOT NULL DEFAULT false,
  source_url text NOT NULL,
  program_version text NOT NULL,
  sha256 text NOT NULL,
  fetched_at timestamptz NOT NULL,
  PRIMARY KEY (program_id, exam_key)
);

CREATE TABLE IF NOT EXISTS public.curriculum_exam_structures (
  id text PRIMARY KEY,
  exam text NOT NULL,
  section text NOT NULL,
  subject text NOT NULL,
  question_count integer NOT NULL CHECK (question_count > 0),
  weight numeric,
  minutes integer,
  sort_order integer NOT NULL,
  source_id text NOT NULL REFERENCES public.curriculum_sources (id),
  source_url text NOT NULL,
  program_version text NOT NULL,
  sha256 text NOT NULL,
  fetched_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.curriculum_calendar_events (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('meb', 'sinav', 'dini')),
  label text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  exam text,
  source_id text NOT NULL REFERENCES public.curriculum_sources (id),
  source_url text NOT NULL,
  program_version text NOT NULL,
  sha256 text NOT NULL,
  fetched_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.curriculum_exclusions (
  id text PRIMARY KEY,
  source_id text NOT NULL,
  section text NOT NULL,
  code text,
  reason text NOT NULL
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['curriculum_sources','curriculum_programs','curriculum_units','curriculum_outcomes',
    'curriculum_exam_scenarios','curriculum_exam_structures','curriculum_calendar_events','curriculum_exclusions']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_public_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', t || '_public_read', t);
    END IF;
  END LOOP;
END $$;
