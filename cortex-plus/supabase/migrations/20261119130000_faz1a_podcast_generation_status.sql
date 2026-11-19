-- Faz 1-A §4.2 (19 Kasım 2026): podcast üretim durumu.
-- İstemci üretim sürerken adımları gösterir: queued → generating_script → synthesizing_audio → ready (ya da failed).
-- Yalnız ekleme: yeni tablo, dizin ve sahip okuma politikası. Var olan hiçbir tabloya dokunmaz; tekrar çalıştırmak güvenli.
-- Yazım sunucuda (service role); öğrenci yalnız kendi satırını okur.

CREATE TABLE IF NOT EXISTS public.podcast_generation_status (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exam_prep_id uuid REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  topic_id uuid,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'generating_script', 'synthesizing_audio', 'ready', 'failed')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS podcast_generation_status_user_updated_idx
  ON public.podcast_generation_status (user_id, updated_at DESC);

ALTER TABLE public.podcast_generation_status ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'podcast_generation_status'
      AND policyname = 'podcast_generation_status_own_read'
  ) THEN
    CREATE POLICY podcast_generation_status_own_read ON public.podcast_generation_status
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END
$$;

COMMENT ON TABLE public.podcast_generation_status IS
  'Faz 1-A §4.2: podcast üretim adımı (queued, generating_script, synthesizing_audio, ready, failed). Sunucu yazar, sahip okur.';
