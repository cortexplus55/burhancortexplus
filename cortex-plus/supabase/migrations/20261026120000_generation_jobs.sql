-- Üretim işi (26 Ekim 2026). Söz verilen sayı dolana kadar arka planda sürer.
-- Sekme kapanınca kira düşünce aynı satırdan devam eder. Kısa sonuç yazılmaz.
--
-- Kod göçten önce yayına çıkabilir: tablo yoksa deneme isteği eşzamanlı dolar,
-- yine de kısa kâğıt yazılmaz. Hesap silme bu tabloyu ayrıca silmez; profil
-- silinince satır kendiliğinden gider. Satır güvenliği açık, politika yok.

CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  prep_id uuid,
  node_id uuid,
  kind text NOT NULL CHECK (kind IN (
    'mock_exam',
    'topic_quiz',
    'true_false',
    'flashcards',
    'final_check',
    'focused',
    'lesson_section',
    'podcast',
    'gaps'
  )),
  spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'done', 'failed')),
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_ref text,
  attempts integer NOT NULL DEFAULT 0,
  charge_reservation_id text,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- NULL node_id benzersiz dizinde ayrıdır; açık düğüm ve düğümsüz iş iki dizindir.
CREATE UNIQUE INDEX IF NOT EXISTS generation_jobs_active_node_idx
  ON public.generation_jobs (user_id, node_id, kind)
  WHERE state IN ('queued', 'running') AND node_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS generation_jobs_active_prep_idx
  ON public.generation_jobs (user_id, prep_id, kind)
  WHERE state IN ('queued', 'running') AND node_id IS NULL;

CREATE INDEX IF NOT EXISTS generation_jobs_lease_idx
  ON public.generation_jobs (state, lease_until);

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.generation_jobs IS
  'Arka plan üretim işi. Öğrenci yalnız ilerleme görür; kısa sonuç yazılmaz.';
