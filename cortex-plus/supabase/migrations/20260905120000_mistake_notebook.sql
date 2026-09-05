-- Yanlış defteri ve günlük tekrar.
--
-- Türk öğrencisinin elle tuttuğu "yanlış defteri"nin çalışan hâli: denemede
-- ya da quizde yanlış yapılan her soru buraya düşer, konuya göre gruplanır ve
-- doğru yapılana kadar tekrar tekrar sorulur.
--
-- Neden soruyu kopyalıyoruz da kaynağa bağlamıyoruz: defter kalıcı olmalı.
-- Öğrenci quizi silerse ya da deneme kaldırılırsa yanlışın kaybolması, tam da
-- defterin var oluş sebebini yok eder. Bu yüzden `source_question_id` bir
-- yabancı anahtar değil, yalnızca aynı sorunun iki kez düşmesini engelleyen
-- bir kimlik.

CREATE TABLE public.mistake_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- 'deneme' | 'quiz'. Öğrenciye "bu nereden geldi" diyebilmek için.
  source text NOT NULL,
  source_question_id uuid NOT NULL,

  topic_label text,
  question_text text NOT NULL,
  options jsonb,
  correct_answer text,
  first_wrong_answer text,
  explanation text,

  -- Kaç kez yanlış yapıldı. Aynı soru ikinci kez yanlış yapılırsa artıyor.
  wrong_count integer NOT NULL DEFAULT 1,
  -- Defterden kaç kez soruldu.
  review_count integer NOT NULL DEFAULT 0,
  -- Üst üste kaç doğru. Araya bir yanlış girerse sıfırlanıyor.
  correct_streak integer NOT NULL DEFAULT 0,

  -- Dolduğu an soru defterden çıkmış sayılıyor. Silmiyoruz: öğrenci neyi
  -- aştığını da görebilmeli.
  mastered_at timestamptz,
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mistake_entries_source CHECK (source IN ('deneme', 'quiz')),
  CONSTRAINT mistake_entries_counts CHECK (
    wrong_count >= 0 AND review_count >= 0 AND correct_streak >= 0
  ),
  UNIQUE (user_id, source_question_id)
);

-- Defter iki şekilde okunuyor: "bekleyenler, en çok yanlış yapılan üstte" ve
-- "günlük tur için sıradakiler". Kısmi indeks yalnızca aşılmamış soruları
-- tutuyor; aşılanlar zamanla çoğunluk olacak ve sorguya girmiyorlar.
CREATE INDEX mistake_entries_open_idx
  ON public.mistake_entries (user_id, wrong_count DESC, created_at)
  WHERE mastered_at IS NULL;

CREATE INDEX mistake_entries_topic_idx
  ON public.mistake_entries (user_id, topic_label)
  WHERE mastered_at IS NULL;

ALTER TABLE public.mistake_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY mistake_entries_own ON public.mistake_entries
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- Günlük tur.
--
-- Günde bir tur; tur açıldığında sorular seçilip donduruluyor. Dondurmasak
-- öğrenci sayfayı yenileyerek soru değiştirebilirdi ve "bugün şunları
-- çözdüm" diye bir şey kalmazdı.
CREATE TABLE public.daily_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  drill_date date NOT NULL,
  entry_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  answered_count integer NOT NULL DEFAULT 0,
  correct_count integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT daily_drills_counts CHECK (
    answered_count >= 0 AND correct_count >= 0 AND correct_count <= answered_count
  ),
  UNIQUE (user_id, drill_date)
);

ALTER TABLE public.daily_drills ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_drills_own ON public.daily_drills
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
