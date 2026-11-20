-- UYGULANDI: 20 Kasım 2026, #708 yayınından sonra, Burhan onayıyla SQL ekranında (kayıt satırıyla); canlıda no-op.
--
-- flashcard_reviews: depodaki tanımı canlı tabloyla eşitler (20 Kasım 2026, yalnız ekleme).
--
-- Neden: depodaki ilk tanım (20250825120000_init) eski biçimde (flashcard_id, next_review_at). Canlı tablo kart
-- anahtarlı biçimde (card_key, card_source, due_at, reps, lapses, last_rating …) ve kart düğümü yazıcısı
-- (`node-card-reviews.ts`) bu biçime yazar. Depodan kurulan bir veritabanında yazım "card_key sütunu yok" diye
-- düşerdi. Bu göç yalnız eksik olanı ekler:
--   * Canlıda her satır no-op (sütunlar, dizinler ve kısıtlar aynı adlarla zaten var; 20 Kasım'da okundu).
--   * DROP, DELETE, UPDATE yok; var olan satıra ve sütuna dokunulmaz.
--   * Eski biçimin `flashcard_id NOT NULL`u yalnız o sütun varsa gevşetilir (canlıda bu sütun yok); kart anahtarlı
--     satır bir `flashcards` kaydına bağlı değildir.
--
-- Geri alma gerekmez: canlıda hiçbir şey değişmez.

ALTER TABLE public.flashcard_reviews
  ADD COLUMN IF NOT EXISTS exam_prep_id uuid REFERENCES public.exam_preps (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS card_key text,
  ADD COLUMN IF NOT EXISTS card_source text,
  ADD COLUMN IF NOT EXISTS topic_label text,
  ADD COLUMN IF NOT EXISTS reps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lapses integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_rating text,
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.flashcard_reviews'::regclass AND conname = 'flashcard_reviews_card_source_check'
  ) THEN
    ALTER TABLE public.flashcard_reviews
      ADD CONSTRAINT flashcard_reviews_card_source_check
      CHECK (card_source IN ('node', 'studio', 'mistake', 'misconception'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.flashcard_reviews'::regclass AND conname = 'flashcard_reviews_last_rating_check'
  ) THEN
    ALTER TABLE public.flashcard_reviews
      ADD CONSTRAINT flashcard_reviews_last_rating_check
      CHECK (last_rating IS NULL OR last_rating IN ('missed', 'hard', 'knew'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'flashcard_reviews'
      AND column_name = 'flashcard_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.flashcard_reviews ALTER COLUMN flashcard_id DROP NOT NULL;
  END IF;
END $$;

-- Yazıcının upsert'ü (onConflict: user_id,card_key) bu tekil dizine dayanır.
CREATE UNIQUE INDEX IF NOT EXISTS flashcard_reviews_user_id_card_key_key ON public.flashcard_reviews (user_id, card_key);
CREATE INDEX IF NOT EXISTS flashcard_reviews_user_due_idx ON public.flashcard_reviews (user_id, due_at);
CREATE INDEX IF NOT EXISTS flashcard_reviews_user_prep_idx ON public.flashcard_reviews (user_id, exam_prep_id)
  WHERE exam_prep_id IS NOT NULL;
