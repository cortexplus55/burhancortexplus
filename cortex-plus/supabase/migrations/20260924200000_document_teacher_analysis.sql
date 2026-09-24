-- Belge başına öğretmen analizi. Yükleme akışının ön koşulu değil:
-- satır yoksa ders, harita ve sohbet bugünkü yoldan devam eder.

CREATE TABLE IF NOT EXISTS public.document_teacher_analyses (
  document_id uuid PRIMARY KEY REFERENCES public.documents(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'skipped',
  analysis jsonb,
  error text,
  chunk_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_teacher_analyses_status_check'
  ) THEN
    ALTER TABLE public.document_teacher_analyses
      ADD CONSTRAINT document_teacher_analyses_status_check
      CHECK (status IN ('pending', 'ready', 'failed', 'skipped'));
  END IF;
END $$;

ALTER TABLE public.document_teacher_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_teacher_analyses_own ON public.document_teacher_analyses;
CREATE POLICY document_teacher_analyses_own ON public.document_teacher_analyses
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.user_id = auth.uid() AND d.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.user_id = auth.uid() AND d.deleted_at IS NULL
    )
  );
