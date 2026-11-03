-- Havuz dışı deneme / konu testi cevabının Hakimiyet Haritası'na (outcome_mastery) yazılma kaydı (3 Kasım 2026).
-- Yalnız ekleme: yeni tablo. item_responses'a (karantina) yalnız havuz soruları yazılmaya devam eder.
-- (user_id, question_key) benzersiz: aynı cevap ikinci kez ustalığa sayılmaz (yeniden notlama / backfill güvenli).
CREATE TABLE IF NOT EXISTS public.exam_answer_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  question_key text NOT NULL,
  prep_id uuid REFERENCES public.exam_preps (id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('deneme', 'konu_testi')),
  outcome_ids text[] NOT NULL,
  weight numeric NOT NULL CHECK (weight > 0 AND weight <= 1),
  correct boolean NOT NULL,
  match_kind text NOT NULL CHECK (match_kind IN ('text', 'unit_spread')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_answer_evidence_user_question_key UNIQUE (user_id, question_key)
);

CREATE INDEX IF NOT EXISTS exam_answer_evidence_user_prep_idx ON public.exam_answer_evidence (user_id, prep_id);

ALTER TABLE public.exam_answer_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_answer_evidence_select_own ON public.exam_answer_evidence;
CREATE POLICY exam_answer_evidence_select_own ON public.exam_answer_evidence
  FOR SELECT USING (auth.uid() = user_id);
