-- Aşama 2: PDF sayfa meta, konu haritası, kapsam, kaynak sınırı (additive).
-- Mevcut exam_preps / document_chunks satırlarına dokunmaz; drop yok.

-- ─── document_pages: çıkarım meta ───────────────────────────────────────────
ALTER TABLE public.document_pages
  ADD COLUMN IF NOT EXISTS extraction_ok boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS page_kind text NOT NULL DEFAULT 'content',
  ADD COLUMN IF NOT EXISTS headings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS formulas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tables_detected integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS images_detected integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uncertain_regions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extraction_method text NOT NULL DEFAULT 'text_layer',
  ADD COLUMN IF NOT EXISTS char_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_pages_page_kind_check'
  ) THEN
    ALTER TABLE public.document_pages
      ADD CONSTRAINT document_pages_page_kind_check
      CHECK (page_kind IN (
        'content', 'cover', 'toc', 'answer_key', 'blank', 'unreadable', 'uncertain'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_pages_extraction_method_check'
  ) THEN
    ALTER TABLE public.document_pages
      ADD CONSTRAINT document_pages_extraction_method_check
      CHECK (extraction_method IN ('text_layer', 'ocr', 'visual', 'manual', 'none'));
  END IF;
END $$;

-- ─── documents: kaynak sınırı + konu haritası durumu ────────────────────────
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS source_boundary_mode text NOT NULL DEFAULT 'documents_only',
  ADD COLUMN IF NOT EXISTS topic_map_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS topic_map_error text,
  ADD COLUMN IF NOT EXISTS topic_map_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_source_boundary_mode_check'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_source_boundary_mode_check
      CHECK (source_boundary_mode IN ('documents_only', 'allow_supporting'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_topic_map_status_check'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_topic_map_status_check
      CHECK (topic_map_status IN ('none', 'pending', 'ready', 'failed', 'reviewed'));
  END IF;
END $$;

-- ─── Konu düğümleri (PDF konu haritası; exam_prep_topics'tan ayrı) ──────────
CREATE TABLE IF NOT EXISTS public.document_topic_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.document_topic_nodes(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  learning_objective text,
  prerequisites jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_definitions jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_relations jsonb NOT NULL DEFAULT '[]'::jsonb,
  worked_examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  common_mistakes jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_exercises jsonb NOT NULL DEFAULT '[]'::jsonb,
  student_notes text,
  is_student_edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_topic_nodes_document_idx
  ON public.document_topic_nodes (document_id, sort_order);

CREATE INDEX IF NOT EXISTS document_topic_nodes_parent_idx
  ON public.document_topic_nodes (parent_id);

-- ─── Sayfa ↔ konu bağları ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_topic_page_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.document_topic_nodes(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES public.document_pages(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  relevance text NOT NULL DEFAULT 'primary',
  UNIQUE (topic_id, page_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_topic_page_links_relevance_check'
  ) THEN
    ALTER TABLE public.document_topic_page_links
      ADD CONSTRAINT document_topic_page_links_relevance_check
      CHECK (relevance IN ('primary', 'secondary', 'mention'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS document_topic_page_links_document_idx
  ON public.document_topic_page_links (document_id, page_number);

CREATE INDEX IF NOT EXISTS document_topic_page_links_page_idx
  ON public.document_topic_page_links (page_id);

-- ─── Kapsam özeti (öğrenciye gösterilen rapor) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_coverage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL UNIQUE REFERENCES public.documents(id) ON DELETE CASCADE,
  total_pages integer NOT NULL DEFAULT 0,
  content_pages integer NOT NULL DEFAULT 0,
  covered_pages integer NOT NULL DEFAULT 0,
  skipped_pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  unreadable_pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  uncovered_content_pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  merged_titles jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'incomplete',
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_coverage_reports_status_check'
  ) THEN
    ALTER TABLE public.document_coverage_reports
      ADD CONSTRAINT document_coverage_reports_status_check
      CHECK (status IN ('complete', 'incomplete', 'blocked'));
  END IF;
END $$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.document_topic_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_topic_page_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_coverage_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_topic_nodes_own ON public.document_topic_nodes;
CREATE POLICY document_topic_nodes_own ON public.document_topic_nodes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id AND d.user_id = auth.uid() AND d.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS document_topic_page_links_own ON public.document_topic_page_links;
CREATE POLICY document_topic_page_links_own ON public.document_topic_page_links FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id AND d.user_id = auth.uid() AND d.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS document_coverage_reports_own ON public.document_coverage_reports;
CREATE POLICY document_coverage_reports_own ON public.document_coverage_reports FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id AND d.user_id = auth.uid() AND d.deleted_at IS NULL
  )
);

-- ─── Feature flag (varsayılan kapalı) ───────────────────────────────────────
INSERT INTO public.feature_flags (key, enabled, description)
VALUES (
  'pdf_learning_v2',
  false,
  'PDF konu haritası, sayfa kapsamı ve kaynak sınırı (Aşama 2+). Kapalıyken mevcut sınav hazırlığı ve RAG process yolu değişmez.'
)
ON CONFLICT (key) DO NOTHING;
