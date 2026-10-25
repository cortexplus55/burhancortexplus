-- Anlatarak öğren geçmişi (25 Ekim 2026). Öğrencinin anlatım denemesi ve model
-- kararı (verdict / gaps / missed). Kod göçten önce yayına çıkabilir: yazma
-- ve okuma tablo yoksa sessizce boş döner; hesap silme bu tabloyu atlar.
--
-- Yazma ve okuma yalnız sunucudan (service_role); satır güvenliği açık, politika yok.

CREATE TABLE IF NOT EXISTS public.explain_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic text NOT NULL CHECK (char_length(topic) BETWEEN 3 AND 300),
  document_id uuid,
  explanation text NOT NULL CHECK (char_length(explanation) BETWEEN 1 AND 8000),
  verdict text NOT NULL CHECK (verdict IN ('anladin', 'kismen', 'ezber')),
  summary text,
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  missed jsonb NOT NULL DEFAULT '[]'::jsonb,
  follow_up text,
  probe_question text,
  parent_id uuid REFERENCES public.explain_attempts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS explain_attempts_user_created_idx
  ON public.explain_attempts (user_id, created_at DESC);

ALTER TABLE public.explain_attempts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.explain_attempts IS
  'Anlatarak öğren denemeleri. Öğrenci metni + model kararı; kredi kaydından ayrı.';
