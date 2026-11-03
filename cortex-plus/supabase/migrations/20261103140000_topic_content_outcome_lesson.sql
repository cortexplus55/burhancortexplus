-- Paket 3b (3 Kasım 2026): kazanım dersi (outcome_lesson) havuzu. Kayıp yok: yalnız sütun, CHECK genişletme ve indeksler.
-- Kod bu migration olmadan da güvenle çalışır (ekleme reddedilir → mevcut akış).
ALTER TABLE public.topic_content ADD COLUMN IF NOT EXISTS outcome_id text REFERENCES public.curriculum_outcomes (id);

-- kind CHECK'e 'outcome_lesson' eklenir (eski değerler aynen geçerli).
ALTER TABLE public.topic_content DROP CONSTRAINT IF EXISTS topic_content_kind_check;
ALTER TABLE public.topic_content
  ADD CONSTRAINT topic_content_kind_check CHECK (kind IN ('lesson', 'summary', 'cards', 'outcome_lesson'));

-- Ünite satırları için canlı satır kuralı aynen (yalnız outcome_id IS NULL satırlar); önce yenisi kurulur, sonra eskisi kalkar.
CREATE UNIQUE INDEX IF NOT EXISTS topic_content_unit_live
  ON public.topic_content (unit_id, kind, version) WHERE status IN ('draft', 'verified') AND outcome_id IS NULL;
DROP INDEX IF EXISTS public.topic_content_live;

-- Kazanım başına tek canlı satır: iki öğrenci aynı anda açarsa ikinci ekleme 23505 alır (çift üretim yok).
CREATE UNIQUE INDEX IF NOT EXISTS topic_content_outcome_live
  ON public.topic_content (outcome_id, kind, version) WHERE status IN ('draft', 'verified') AND outcome_id IS NOT NULL;
