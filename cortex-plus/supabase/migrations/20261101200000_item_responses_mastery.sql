-- Plan PR 3 (⚡ Akıllı Hızlı Tarama + Ünite Seviye Kontrolü): yanıt kaydı ve kazanım ustalığı (Beta-Binomial).
-- Yalnız ekleme: yeni iki tablo, dizinler, RLS (öğrenci yalnız kendi satırını okur; yazma service_role ile sunucudan).

CREATE TABLE IF NOT EXISTS public.item_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.item_bank (id),
  unit_id text NOT NULL REFERENCES public.curriculum_units (id),
  outcome_id text NOT NULL REFERENCES public.curriculum_outcomes (id),
  prep_id uuid REFERENCES public.exam_preps (id) ON DELETE SET NULL,
  correct boolean NOT NULL,
  difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  time_ms integer CHECK (time_ms IS NULL OR time_ms >= 0),
  source text NOT NULL CHECK (source IN ('quick_scan', 'unit_check', 'full_scan', 'practice')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS item_responses_user_created_idx ON public.item_responses (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS item_responses_user_item_source_idx ON public.item_responses (user_id, item_id, source);
CREATE INDEX IF NOT EXISTS item_responses_user_unit_source_idx ON public.item_responses (user_id, unit_id, source, prep_id);
CREATE INDEX IF NOT EXISTS item_responses_prep_idx ON public.item_responses (prep_id) WHERE prep_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.outcome_mastery (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  outcome_id text NOT NULL REFERENCES public.curriculum_outcomes (id),
  unit_id text NOT NULL REFERENCES public.curriculum_units (id),
  program_id text NOT NULL REFERENCES public.curriculum_programs (id),
  alpha numeric NOT NULL DEFAULT 1 CHECK (alpha > 0),
  beta numeric NOT NULL DEFAULT 1 CHECK (beta > 0),
  n integer NOT NULL DEFAULT 0 CHECK (n >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outcome_mastery_user_outcome_key UNIQUE (user_id, outcome_id)
);

CREATE INDEX IF NOT EXISTS outcome_mastery_user_unit_idx ON public.outcome_mastery (user_id, unit_id);
CREATE INDEX IF NOT EXISTS outcome_mastery_user_program_idx ON public.outcome_mastery (user_id, program_id);

-- RLS yalnız bu dosyanın oluşturduğu yeni tablolarda açılır.
ALTER TABLE public.item_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcome_mastery ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'item_responses' AND policyname = 'item_responses_select_own') THEN
    CREATE POLICY item_responses_select_own ON public.item_responses FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'outcome_mastery' AND policyname = 'outcome_mastery_select_own') THEN
    CREATE POLICY outcome_mastery_select_own ON public.outcome_mastery FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

GRANT SELECT ON public.item_responses, public.outcome_mastery TO authenticated;
GRANT ALL ON public.item_responses, public.outcome_mastery TO service_role;
