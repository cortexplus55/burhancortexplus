-- Duellolar (30 Eylul 2026) — Astra'daki "sinif arkadaslarinla duello yap".
-- Bir ogrenci hazirligindan 7 soruluk duello kurar; baglantiyi alan herkes
-- (hesapsiz da) ayni sorulari oynar. Puani sunucu hesaplar; dogru cevaplar
-- tarayiciya gonderilmez.

CREATE TABLE IF NOT EXISTS public.prep_duels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  topic_label text,
  -- [{ "text": string, "options": string[4], "answer": 0-3 }]
  questions jsonb NOT NULL,
  share_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prep_duels_prep_idx
  ON public.prep_duels (exam_prep_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.prep_duel_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id uuid NOT NULL REFERENCES public.prep_duels(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  -- [{ "choice": 0-3 | null, "ms": int }]
  answers jsonb NOT NULL,
  correct integer NOT NULL CHECK (correct >= 0),
  score integer NOT NULL CHECK (score >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prep_duel_runs_duel_idx
  ON public.prep_duel_runs (duel_id, score DESC, created_at);

ALTER TABLE public.prep_duels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prep_duel_runs ENABLE ROW LEVEL SECURITY;

-- Kurucu kendi duellolarini gorur. Paylasim sayfasi ve oyun sunucuda
-- servis anahtariyla okunur; sorularin dogru cevabi istemciye gitmez.
DROP POLICY IF EXISTS prep_duels_own_select ON public.prep_duels;
CREATE POLICY prep_duels_own_select ON public.prep_duels
  FOR SELECT USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS prep_duel_runs_own_select ON public.prep_duel_runs;
CREATE POLICY prep_duel_runs_own_select ON public.prep_duel_runs
  FOR SELECT USING (
    auth.uid() = player_id
    OR EXISTS (
      SELECT 1 FROM public.prep_duels d
      WHERE d.id = prep_duel_runs.duel_id AND d.creator_id = auth.uid()
    )
  );
-- Ekleme yalnizca sunucudan (servis anahtari); istemci politikasi yok.
