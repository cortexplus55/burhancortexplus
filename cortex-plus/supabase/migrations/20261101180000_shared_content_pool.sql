-- Ortak içerik havuzu (Plan PR 2, R3 — 1 Kasım 2026). YALNIZ EKLEME: mevcut tablo/sütuna dokunulmaz, silme yok.
-- topic_content ünite düzeyindedir (ünitenin tüm kazanımları ve sınırlamaları); item_bank her soruyu hem ünite hem
-- kazanımla etiketler. Tüm içerik origin='cortex_original'; çıkmış soru metni tutulmaz, resmî kaynak yalnız dış
-- bağlantıdır (source_links). Okuma herkese açık ve yalnız doğrulanmış satırlar; yazma yalnız servis rolü.

CREATE TABLE IF NOT EXISTS public.topic_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id text NOT NULL REFERENCES public.curriculum_units (id),
  program_id text NOT NULL REFERENCES public.curriculum_programs (id),
  version integer NOT NULL DEFAULT 1,
  kind text NOT NULL DEFAULT 'lesson' CHECK (kind IN ('lesson', 'summary', 'cards')),
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome_ids text[] NOT NULL DEFAULT '{}',
  unit_sha256 text NOT NULL,
  source_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'verified', 'stale', 'rejected')),
  origin text NOT NULL DEFAULT 'cortex_original' CHECK (origin = 'cortex_original'),
  qa jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Ünite + tür + sürüm için tek "canlı" satır (üretimde kilit = draft, sonra verified). stale/rejected geçmiş olarak kalır.
CREATE UNIQUE INDEX IF NOT EXISTS topic_content_live
  ON public.topic_content (unit_id, kind, version) WHERE status IN ('draft', 'verified');
CREATE INDEX IF NOT EXISTS topic_content_program ON public.topic_content (program_id, status);

CREATE TABLE IF NOT EXISTS public.item_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid REFERENCES public.topic_content (id),
  unit_id text NOT NULL REFERENCES public.curriculum_units (id),
  outcome_id text NOT NULL REFERENCES public.curriculum_outcomes (id),
  program_id text NOT NULL REFERENCES public.curriculum_programs (id),
  version integer NOT NULL DEFAULT 1,
  difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  stem text NOT NULL,
  choices jsonb NOT NULL,
  answer integer NOT NULL CHECK (answer >= 0),
  explanation text NOT NULL,
  similarity_max numeric,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'verified', 'stale', 'rejected')),
  origin text NOT NULL DEFAULT 'cortex_original' CHECK (origin = 'cortex_original'),
  qa jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS item_bank_unit ON public.item_bank (unit_id, status, difficulty);
CREATE INDEX IF NOT EXISTS item_bank_outcome ON public.item_bank (outcome_id, status, difficulty);

ALTER TABLE public.topic_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_bank ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.topic_content, public.item_bank FROM anon, authenticated;
GRANT SELECT ON public.topic_content, public.item_bank TO anon, authenticated;
GRANT ALL ON public.topic_content, public.item_bank TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'topic_content' AND policyname = 'topic_content_read_verified') THEN
    CREATE POLICY topic_content_read_verified ON public.topic_content FOR SELECT TO anon, authenticated USING (status = 'verified');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'item_bank' AND policyname = 'item_bank_read_verified') THEN
    CREATE POLICY item_bank_read_verified ON public.item_bank FOR SELECT TO anon, authenticated USING (status = 'verified');
  END IF;
END $$;

-- Kapsama: program başına doğrulanmış ünite sayısı (kapsama paneli ve "hazır" rozeti için).
CREATE OR REPLACE VIEW public.topic_content_coverage WITH (security_invoker = true) AS
SELECT u.program_id,
       count(*) AS units,
       count(c.id) AS verified_units
FROM public.curriculum_units u
LEFT JOIN public.topic_content c ON c.unit_id = u.id AND c.kind = 'lesson' AND c.status = 'verified'
GROUP BY u.program_id;
GRANT SELECT ON public.topic_content_coverage TO anon, authenticated, service_role;

COMMENT ON TABLE public.topic_content IS 'Ortak ünite içeriği (origin=cortex_original). Doğrulanmış satır 0 model çağrısıyla sunulur.';
COMMENT ON TABLE public.item_bank IS 'Ortak soru havuzu; unit_id + outcome_id etiketli. Çıkmış soru metni tutulmaz.';
