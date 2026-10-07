-- Sıradaki dersin önceden hazırlanması (3 Ekim 2026, ürün sahibinin kararı).
-- Öğrenci bir dersi açınca yoldaki bir sonraki ders arka planda yazılır ve
-- burada bekler; öğrenci açınca beklemeden gelir. Kredi yalnız açılınca
-- düşer. Düğüm başına tek satır; açılınca silinir. Yalnız sunucu
-- (service_role) okur ve yazar — öğrenciye politika yok.
CREATE TABLE IF NOT EXISTS public.exam_prep_prefetch (
  node_id uuid PRIMARY KEY REFERENCES public.exam_prep_nodes(id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  topic_id uuid,
  familiarity text NOT NULL,
  status text NOT NULL DEFAULT 'creating' CHECK (status IN ('creating', 'ready')),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_prep_prefetch_user_idx ON public.exam_prep_prefetch (user_id);

ALTER TABLE public.exam_prep_prefetch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exam_prep_prefetch FROM anon, authenticated;
GRANT ALL ON public.exam_prep_prefetch TO service_role;
