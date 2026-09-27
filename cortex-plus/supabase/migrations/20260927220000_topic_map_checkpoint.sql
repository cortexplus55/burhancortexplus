-- Long document maps are built one bounded page window per request. Keep only
-- model-produced topic names and physical page numbers between requests; the
-- source text remains in document_pages. Service-role code owns this table.
CREATE TABLE IF NOT EXISTS public.document_topic_map_jobs (
  document_id uuid PRIMARY KEY REFERENCES public.documents(id) ON DELETE CASCADE,
  next_index integer NOT NULL DEFAULT 0 CHECK (next_index >= 0),
  topics jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(topics) = 'array'),
  lease_until timestamptz,
  lease_token uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_topic_map_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_topic_map_jobs FROM anon, authenticated;
