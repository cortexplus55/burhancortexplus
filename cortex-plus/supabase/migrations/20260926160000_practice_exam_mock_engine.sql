-- Yazılı deneme tek motor: blueprint, süre, kaynaklı soru alanları, kısmi puan.
-- Geri uyumlu: ADD COLUMN IF NOT EXISTS. Canlıya agent uygulamayacak.

-- ─── practice_exams ──────────────────────────────────────────────────────────
ALTER TABLE public.practice_exams
  ADD COLUMN IF NOT EXISTS blueprint jsonb,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS topic_ids uuid[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'practice_exams_scope_check'
  ) THEN
    ALTER TABLE public.practice_exams
      ADD CONSTRAINT practice_exams_scope_check
      CHECK (scope IS NULL OR scope IN ('all', 'topics'));
  END IF;
END $$;

COMMENT ON COLUMN public.practice_exams.blueprint IS
  'Sınav planı: soru sayısı, türler, puanlar, süre, konu dağılımı.';
COMMENT ON COLUMN public.practice_exams.deadline_at IS
  'Sunucu süresi. İstemci sayacı yalnız göstergedir.';
COMMENT ON COLUMN public.practice_exams.scope IS
  'all = tüm sınav; topics = seçili topic_ids.';

-- ─── practice_exam_questions ─────────────────────────────────────────────────
ALTER TABLE public.practice_exam_questions
  ADD COLUMN IF NOT EXISTS topic_id uuid REFERENCES public.exam_prep_topics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS topic_label text,
  ADD COLUMN IF NOT EXISTS correct_answers jsonb,
  ADD COLUMN IF NOT EXISTS explanation text,
  ADD COLUMN IF NOT EXISTS option_why jsonb,
  ADD COLUMN IF NOT EXISTS rubric jsonb,
  ADD COLUMN IF NOT EXISTS model_answer text,
  ADD COLUMN IF NOT EXISTS source_document_id uuid,
  ADD COLUMN IF NOT EXISTS source_page integer,
  ADD COLUMN IF NOT EXISTS source_label text,
  ADD COLUMN IF NOT EXISTS difficulty text;

DO $$
BEGIN
  -- Eski satırlar yalnız mcq/multi_mcq; yeni türler eklenince kısıt genişler.
  ALTER TABLE public.practice_exam_questions
    DROP CONSTRAINT IF EXISTS practice_exam_questions_type_check;
  ALTER TABLE public.practice_exam_questions
    ADD CONSTRAINT practice_exam_questions_type_check
    CHECK (
      question_type IS NULL
      OR question_type IN (
        'mcq', 'multi_mcq', 'true_false', 'numeric', 'short_answer', 'open'
      )
    );
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'practice_exam_questions_type_check skipped: %', SQLERRM;
END $$;

COMMENT ON COLUMN public.practice_exam_questions.correct_answers IS
  'Çok cevaplı ve genel anahtar: metin dizisi. Eski correct_answer korunur.';
COMMENT ON COLUMN public.practice_exam_questions.source_label IS
  'Öğrenciye gösterilen kaynak satırı (dosya + sayfa/slayt).';

-- ─── practice_exam_item_reviews ──────────────────────────────────────────────
ALTER TABLE public.practice_exam_item_reviews
  ADD COLUMN IF NOT EXISTS points_earned numeric,
  ADD COLUMN IF NOT EXISTS points_max numeric,
  ADD COLUMN IF NOT EXISTS verdict text,
  ADD COLUMN IF NOT EXISTS feedback jsonb;

COMMENT ON COLUMN public.practice_exam_item_reviews.feedback IS
  'Rubrik satırları, alıntılar, sayısal adımlar — model uydurması yok.';

-- ─── exam_prep_node_attempts → practice_exams bağ ───────────────────────────
ALTER TABLE public.exam_prep_node_attempts
  ADD COLUMN IF NOT EXISTS practice_exam_id uuid REFERENCES public.practice_exams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS exam_prep_node_attempts_practice_exam_idx
  ON public.exam_prep_node_attempts (practice_exam_id)
  WHERE practice_exam_id IS NOT NULL;

-- ─── practice_exam_attempts: süre + konu karne ───────────────────────────────
ALTER TABLE public.practice_exam_attempts
  ADD COLUMN IF NOT EXISTS answers jsonb,
  ADD COLUMN IF NOT EXISTS topic_report jsonb,
  ADD COLUMN IF NOT EXISTS flagged_ids uuid[],
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

-- ─── Kredi: değerlendirme üretim ücretine dahil ──────────────────────────────
-- Eski: GENERATE 5 + GRADE 3 = 8. Yeni: GENERATE 8, GRADE 0 (bitişte 402 yok).
UPDATE public.credit_rules
   SET credit_cost = 8,
       updated_at  = now()
 WHERE action_code = 'PRACTICE_EXAM_GENERATE';

UPDATE public.credit_rules
   SET credit_cost = 0,
       updated_at  = now()
 WHERE action_code = 'PRACTICE_EXAM_GRADE';
