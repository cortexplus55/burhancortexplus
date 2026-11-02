-- "Senin belgenden ek" (2 Kasım 2026, ürün sahibinin kararı): belge eklenince havuz dersi kalır; belgenin kapsadığı
-- üniteye öğrenciye özel ek bölüm yazılır. Ünite ve belge kümesi başına bir kez (yeniden ücret yok). Yalnız ekleme.
CREATE TABLE IF NOT EXISTS public.user_unit_supplements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  program_id text NOT NULL,
  unit_id text NOT NULL,
  source_key text NOT NULL,
  document_ids uuid[] NOT NULL DEFAULT '{}',
  pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  body jsonb NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exam_prep_id, unit_id, source_key)
);
ALTER TABLE public.user_unit_supplements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_unit_supplements_owner_read ON public.user_unit_supplements;
CREATE POLICY user_unit_supplements_owner_read ON public.user_unit_supplements
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS user_unit_supplements_prep_idx ON public.user_unit_supplements (exam_prep_id, unit_id);
