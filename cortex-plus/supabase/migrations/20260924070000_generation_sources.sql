-- Üretilen içerik kaynağına bağlanıyor.
--
-- Belge detay sayfası "bu belgeden üretilenler"i gösterebilsin diye quiz ve
-- flashcard setleri belgeye işaret ediyor. Podcast senaryosu da saklanıyor:
-- ses satırları içerik adresli önbellekte (lesson_audio) durduğu için yeniden
-- dinlemek bedava; saklanan tek şey metin.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS quizzes_document_idx ON public.quizzes (document_id) WHERE document_id IS NOT NULL;

-- Quiz sorusunun "neden" açıklaması: yanlış cevapta "Yanlış." demekle
-- kalınmıyor; açıklama yanlış defterine de aynı metinle düşüyor.
ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS explanation text;

ALTER TABLE public.flashcard_sets
  ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS flashcard_sets_document_idx ON public.flashcard_sets (document_id) WHERE document_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.podcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  topic text NOT NULL,
  title text NOT NULL,
  tagline text,
  chapters jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS podcasts_user_idx ON public.podcasts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS podcasts_document_idx ON public.podcasts (document_id) WHERE document_id IS NOT NULL;

ALTER TABLE public.podcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY podcasts_own_select ON public.podcasts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY podcasts_own_delete ON public.podcasts FOR DELETE TO authenticated USING (user_id = auth.uid());
-- Yazma yalnızca sunucudan (service_role): senaryo bir üretimin çıktısı, elle eklenmez.
