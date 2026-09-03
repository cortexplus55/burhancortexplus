-- ============================================================================
-- Faz 1 — Ders başına kalibrasyon, ruh hali ve hazırlık puanı
--
-- Tamamen additive: hiçbir DROP TABLE, hiçbir kolon silme/yeniden adlandırma.
-- Mevcut satırlar etkilenmez; yeni kolonların hepsi nullable ya da varsayılanlı.
--
-- Bu repodaki migration dosyaları ile canlı şema geçmişi ayrık (bkz.
-- docs/delivery/CLI-CONNECT.md). Dosya kayıt olarak durur; uygulama SQL
-- editöründen yapılır. Her ifade tek satır ve tekrar çalıştırılabilir —
-- editörün otomatik girintisi çok satırlı blokları bozabildiği için.
-- ============================================================================

-- --- 1) Konu bazlı ön bilgi (sonraki derste varsayılan olarak gelir) --------
ALTER TABLE public.exam_prep_topics ADD COLUMN IF NOT EXISTS familiarity text;
ALTER TABLE public.exam_prep_topics DROP CONSTRAINT IF EXISTS exam_prep_topics_familiarity_check;
ALTER TABLE public.exam_prep_topics ADD CONSTRAINT exam_prep_topics_familiarity_check CHECK (familiarity IS NULL OR familiarity IN ('new','heard','basics','good','confident'));

-- --- 2) Deneme bazlı sinyaller (difficulty/voice_mode zaten burada) --------
ALTER TABLE public.exam_prep_node_attempts ADD COLUMN IF NOT EXISTS familiarity text;
ALTER TABLE public.exam_prep_node_attempts ADD COLUMN IF NOT EXISTS mood text;
ALTER TABLE public.exam_prep_node_attempts DROP CONSTRAINT IF EXISTS exam_prep_node_attempts_familiarity_check;
ALTER TABLE public.exam_prep_node_attempts ADD CONSTRAINT exam_prep_node_attempts_familiarity_check CHECK (familiarity IS NULL OR familiarity IN ('new','heard','basics','good','confident'));
ALTER TABLE public.exam_prep_node_attempts DROP CONSTRAINT IF EXISTS exam_prep_node_attempts_mood_check;
ALTER TABLE public.exam_prep_node_attempts ADD CONSTRAINT exam_prep_node_attempts_mood_check CHECK (mood IS NULL OR mood IN ('ready','curious','calm','neutral','low_energy','stressed'));

-- --- 3) Hazırlık puanı (liste ekranı düğümleri okumasın diye önbellek) -----
ALTER TABLE public.exam_preps ADD COLUMN IF NOT EXISTS readiness_score integer NOT NULL DEFAULT 0;
ALTER TABLE public.exam_preps DROP CONSTRAINT IF EXISTS exam_preps_readiness_score_check;
ALTER TABLE public.exam_preps ADD CONSTRAINT exam_preps_readiness_score_check CHECK (readiness_score BETWEEN 0 AND 100);

-- --- 4) Ruh hali geçmişi (zaman içinde desen çıkarmak için) ----------------
CREATE TABLE IF NOT EXISTS public.study_session_moods (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, exam_prep_id uuid REFERENCES public.exam_preps(id) ON DELETE CASCADE, node_id uuid REFERENCES public.exam_prep_nodes(id) ON DELETE SET NULL, mood text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.study_session_moods DROP CONSTRAINT IF EXISTS study_session_moods_mood_check;
ALTER TABLE public.study_session_moods ADD CONSTRAINT study_session_moods_mood_check CHECK (mood IN ('ready','curious','calm','neutral','low_energy','stressed'));
CREATE INDEX IF NOT EXISTS study_session_moods_user ON public.study_session_moods (user_id, created_at DESC);
ALTER TABLE public.study_session_moods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS study_session_moods_owner ON public.study_session_moods;
CREATE POLICY study_session_moods_owner ON public.study_session_moods FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
