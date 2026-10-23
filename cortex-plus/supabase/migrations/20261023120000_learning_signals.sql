-- Gerçek öğrenme ölçüleri (23 Ekim 2026, ürün sahibinin kararı: "tekrar doğruluk oranı, ders sonunda
-- anlaşılır mıydı, günlük otomatik kalite örneği"). Yalnız ekleme: yeni iki tablo, var olana dokunulmaz.
--
-- 1) exam_prep_review_answers: günü gelen tekrarın her cevabı, cevap anındaki basamağıyla (0 = 1. gün,
--    1 = 3. gün, 2 = 7. gün, 3 = 14. gün). Tekrar satırı yalnız son durumu tutuyordu; "3. ve 7. günde doğru
--    oranı" ondan çıkmıyordu. Yazım `answerReviewItem`'da, satır güncellendikten sonra; tablo yoksa sessizce atlanır.
-- 2) lesson_quality_samples: ders kalitesi örnekleri. source 'verifier': yazım sırasında denetçinin kısımlara verdiği
--    öğretim puanları (ek model çağrısı yok). source 'judge': günlük cron'un önceki günün derslerinden seçtiği
--    birkaçını bağımsız bir yargıca puanlatması (günde birkaç sent).
--
-- İkisinde de satır güvenliği açık, politika yok: yalnız service_role okur ve yazar. Hesap silinince
-- profiles üzerinden kendiliğinden silinir (ON DELETE CASCADE).

CREATE TABLE IF NOT EXISTS public.exam_prep_review_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.exam_prep_review_items(id) ON DELETE CASCADE,
  topic_label text,
  step smallint NOT NULL CHECK (step BETWEEN 0 AND 3),
  correct boolean NOT NULL,
  answered_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_prep_review_answers_day_idx
  ON public.exam_prep_review_answers (answered_on);

ALTER TABLE public.exam_prep_review_answers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.lesson_quality_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('verifier', 'judge')),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  exam_prep_id uuid REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  attempt_id uuid,
  topic_label text,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  total numeric(5, 1),
  model text,
  note text,
  sampled_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Istanbul')::date),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lesson_quality_samples_day_idx
  ON public.lesson_quality_samples (sampled_on, source);

CREATE UNIQUE INDEX IF NOT EXISTS lesson_quality_samples_judge_once
  ON public.lesson_quality_samples (attempt_id)
  WHERE source = 'judge' AND attempt_id IS NOT NULL;

ALTER TABLE public.lesson_quality_samples ENABLE ROW LEVEL SECURITY;
