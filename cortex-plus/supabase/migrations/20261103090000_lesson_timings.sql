-- Ders açılış telemetrisi (3 Kasım 2026, stream-first). Yalnız ekleme: yeni tablo.
-- stream_first: soğuk ders, ilk ekran denetim beklemeden · prefetch_ready / prefetch_adopted: önceden yazılmış ders ·
-- pool: ortak havuzdan sunulan ders. ms değerleri sunucu süresi (istek başından), ağ hariç.
CREATE TABLE IF NOT EXISTS public.lesson_timings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  path text NOT NULL CHECK (path IN ('stream_first', 'prefetch_ready', 'prefetch_adopted', 'pool', 'client')),
  open_ms integer NOT NULL CHECK (open_ms >= 0 AND open_ms < 600000),
  first_screen_ms integer CHECK (first_screen_ms IS NULL OR (first_screen_ms >= 0 AND first_screen_ms < 600000)),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lesson_timings_created_idx ON public.lesson_timings (created_at DESC);
CREATE INDEX IF NOT EXISTS lesson_timings_path_idx ON public.lesson_timings (path, created_at DESC);

ALTER TABLE public.lesson_timings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.lesson_timings IS
  'Ders açılış süreleri (stream-first ilk ekran, önceden yazılmış ve havuz dersi açılışı). Yalnız service role yazar/okur.';
