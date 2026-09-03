-- ============================================================================
-- Günün bulmacaları + liderlik tablosu
--
-- Astra'da gözlemlenen (Öğrenme uygulamaları sekmesi, 2026-09-03):
--   "Bugünün bulmacaları — 0/8 çözüldü"
--   her bulmaca için "Liderlik Tablosu" + oyuncu süreleri (1:57.8, 41.9s, 4.5s)
--   çözülmemiş olanlarda "İlk çözen sen ol — süren burada görünecek."
--
-- Neden yeni tablo: mevcut lab_app_plays yalnızca "açıldı" sayıyor. Bulmaca
-- döngüsü için ÇÖZÜM ve SÜRE lazım; bunlar farklı olaylar.
--
-- Günün seçkisi burada değil, TypeScript tarafında (lib/parity/daily-puzzles.ts)
-- hesaplanıyor: bulmaca kataloğu zaten orada bir sabit ve tarihten türeyen
-- deterministik bir seçim için veritabanına gitmeye gerek yok.
--
-- Tamamen additive.
-- ============================================================================

-- --- 1) Çözüm kayıtları -----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lab_puzzle_runs (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  puzzle_id text NOT NULL,
  puzzle_date date NOT NULL,
  duration_ms integer NOT NULL,
  moves integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, puzzle_id, puzzle_date)
);

-- Saniyenin altı ile 6 saat arası; dışı veri hatası ya da kötüye kullanım.
ALTER TABLE public.lab_puzzle_runs DROP CONSTRAINT IF EXISTS lab_puzzle_runs_duration_check;
ALTER TABLE public.lab_puzzle_runs ADD CONSTRAINT lab_puzzle_runs_duration_check
  CHECK (duration_ms BETWEEN 500 AND 21600000);

-- Liderlik sorgusu: gün + bulmaca içinde süreye göre sırala.
CREATE INDEX IF NOT EXISTS lab_puzzle_runs_board_idx
  ON public.lab_puzzle_runs (puzzle_id, puzzle_date, duration_ms);

ALTER TABLE public.lab_puzzle_runs ENABLE ROW LEVEL SECURITY;

-- Kendi kaydını görür. Başkalarının süreleri yalnızca aşağıdaki
-- SECURITY DEFINER fonksiyonu üzerinden, ad ve süreyle sınırlı çıkar —
-- tabloyu herkese açmak gereksiz veri sızdırırdı.
DROP POLICY IF EXISTS lab_puzzle_runs_own ON public.lab_puzzle_runs;
CREATE POLICY lab_puzzle_runs_own ON public.lab_puzzle_runs
  FOR SELECT USING (user_id = auth.uid());

-- --- 2) Çözüm gönderimi -----------------------------------------------------

-- En iyi süre tutulur: aynı gün tekrar çözen kullanıcı süresini ancak
-- iyileştirirse tablo güncellenir.
CREATE OR REPLACE FUNCTION public.puzzle_submit(
  p_puzzle_id text,
  p_duration_ms integer,
  p_moves integer DEFAULT NULL
)
RETURNS TABLE (best_ms integer, improved boolean)
AS $BODY$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_prev integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_duration_ms IS NULL OR p_duration_ms < 500 OR p_duration_ms > 21600000 THEN
    RAISE EXCEPTION 'invalid_duration';
  END IF;

  SELECT r.duration_ms INTO v_prev
  FROM public.lab_puzzle_runs r
  WHERE r.user_id = v_user AND r.puzzle_id = p_puzzle_id AND r.puzzle_date = v_today;

  IF v_prev IS NULL THEN
    INSERT INTO public.lab_puzzle_runs (user_id, puzzle_id, puzzle_date, duration_ms, moves)
    VALUES (v_user, p_puzzle_id, v_today, p_duration_ms, p_moves);
    RETURN QUERY SELECT p_duration_ms, true;
  ELSIF p_duration_ms < v_prev THEN
    UPDATE public.lab_puzzle_runs
       SET duration_ms = p_duration_ms, moves = p_moves, updated_at = now()
     WHERE user_id = v_user AND puzzle_id = p_puzzle_id AND puzzle_date = v_today;
    RETURN QUERY SELECT p_duration_ms, true;
  ELSE
    RETURN QUERY SELECT v_prev, false;
  END IF;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

-- --- 3) Liderlik tablosu ----------------------------------------------------

-- Yalnızca ad ve süre çıkar. Ad, profildeki tam adın ilk kelimesi —
-- soyadı paylaşmaya gerek yok.
CREATE OR REPLACE FUNCTION public.puzzle_leaderboard(
  p_puzzle_id text,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  rank integer,
  display_name text,
  duration_ms integer,
  is_me boolean
)
AS $BODY$
  SELECT
    ROW_NUMBER() OVER (ORDER BY r.duration_ms ASC, r.created_at ASC)::integer,
    COALESCE(NULLIF(split_part(COALESCE(p.full_name, ''), ' ', 1), ''), 'Öğrenci'),
    r.duration_ms,
    r.user_id = auth.uid()
  FROM public.lab_puzzle_runs r
  JOIN public.profiles p ON p.id = r.user_id
  WHERE r.puzzle_id = p_puzzle_id
    AND r.puzzle_date = (now() AT TIME ZONE 'Europe/Istanbul')::date
  ORDER BY r.duration_ms ASC, r.created_at ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

-- --- 4) Bugünkü ilerlemem ---------------------------------------------------

-- "0/8 çözüldü" rozeti ve kartlardaki "senin süren" için tek sorguda hepsi.
CREATE OR REPLACE FUNCTION public.puzzle_my_day()
RETURNS TABLE (puzzle_id text, duration_ms integer)
AS $BODY$
  SELECT r.puzzle_id, r.duration_ms
  FROM public.lab_puzzle_runs r
  WHERE r.user_id = auth.uid()
    AND r.puzzle_date = (now() AT TIME ZONE 'Europe/Istanbul')::date;
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;
