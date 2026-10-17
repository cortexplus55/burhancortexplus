-- ============================================================================
-- Video ders (17 Ekim 2026, ürün sahibinin kararı: Astra'daki gibi, yalnız Plus)
--
-- Astra'da 1 dakikalık dikey video; bizde kararla oynatıcıda birleşen video:
-- sahne başına bir resim ve bir ses dosyası (lesson-audio deposunda,
-- video/<öğrenci>/<video>/ altında) ve anlatım metni. Bu tablo sahnelerin
-- listesini tutar; yazma yalnız sunucudan.
--
-- Kredi: VIDEO_GENERATE 280 (6-8 resim + ~1 dk ses + senaryo; resim işin büyük
-- kısmı). price-table.ts aynı sayıyı söyler.
--
-- Tamamen additive. Editör notu: satır sonunda çıplak THEN bırakmayın.
-- 17 Ekim 2026'da SQL editöründe bu hâliyle çalıştırıldı.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.prep_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  topic_id uuid,
  topic_label text NOT NULL,
  style text NOT NULL,
  title text NOT NULL,
  scenes jsonb NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prep_videos_style_check CHECK (style IN ('realistic', 'comic', 'whiteboard', 'brainrot', 'meme'))
);

CREATE INDEX IF NOT EXISTS prep_videos_owner_idx ON public.prep_videos (user_id, exam_prep_id, created_at DESC);

ALTER TABLE public.prep_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY prep_videos_own ON public.prep_videos FOR SELECT USING (user_id = auth.uid());

INSERT INTO public.credit_rules (action_code, credit_cost, model_tier, description, active) VALUES
  ('VIDEO_GENERATE', 280, 'standard', 'Video ders (1 dakika; sahne resimleri + seslendirme)', true)
ON CONFLICT (action_code) DO UPDATE
  SET credit_cost = EXCLUDED.credit_cost, description = EXCLUDED.description,
      active = true, updated_at = now();
