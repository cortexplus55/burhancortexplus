-- Faz 2 (madde 3): Yanlışlar Defteri 22P02.
--
-- Kök neden: hazırlık yolundaki konu testi, doğru/yanlış, dinleme ve ders içi kontrol sorularının kimliği bir
-- satır kimliği değil, etkinlik içindeki sıradır (`<attemptId>:q:0`, `:tf:1`, `:pc:2`, `:lc:3`). Bu metin
-- `source_question_id uuid NOT NULL` sütununa yazılınca Postgres 22P02 (invalid input syntax for type uuid)
-- veriyordu ve hata yutulduğu için öğrencinin yanlışı deftere hiç düşmüyordu.
--
-- Çözüm (ekleyici, tekrar çalıştırılabilir, hiçbir satırı silmez ya da değiştirmez):
--   1. `source_ref text` sütunu: UUID olmayan yol kimliği buraya yazılır.
--   2. `source_question_id` NOT NULL kalkar: yol sorusunda UUID yoktur. Deneme soruları (gerçek UUID) aynen
--      `source_question_id`e yazılmaya devam eder; var olan UNIQUE (user_id, source_question_id) değişmez.
--   3. Yol kimliği için tekil indeks (kullanıcı + kaynak + yol kimliği); yalnız dolu satırlar.
--   4. Kaynak CHECK'i genişler: 'true_false', 'lesson_check', 'podcast' eklenir. Var olan satırlar ('deneme',
--      'quiz') yeni kümede de geçerlidir; kısıt NOT VALID eklenip ayrıca doğrulanır.
--   5. Her satırın en az bir kimliği olsun (ya UUID ya yol kimliği): eski satırların hepsinde UUID dolu.

ALTER TABLE public.mistake_entries ADD COLUMN IF NOT EXISTS source_ref text;

ALTER TABLE public.mistake_entries ALTER COLUMN source_question_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mistake_entries_user_source_ref_idx
  ON public.mistake_entries (user_id, source, source_ref)
  WHERE source_ref IS NOT NULL;

ALTER TABLE public.mistake_entries DROP CONSTRAINT IF EXISTS mistake_entries_source;
ALTER TABLE public.mistake_entries
  ADD CONSTRAINT mistake_entries_source
  CHECK (source IN ('deneme', 'quiz', 'true_false', 'lesson_check', 'podcast')) NOT VALID;
ALTER TABLE public.mistake_entries VALIDATE CONSTRAINT mistake_entries_source;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mistake_entries_has_identity' AND conrelid = 'public.mistake_entries'::regclass
  ) THEN
    ALTER TABLE public.mistake_entries
      ADD CONSTRAINT mistake_entries_has_identity
      CHECK (source_question_id IS NOT NULL OR source_ref IS NOT NULL) NOT VALID;
  END IF;
END $$;
ALTER TABLE public.mistake_entries VALIDATE CONSTRAINT mistake_entries_has_identity;

COMMENT ON COLUMN public.mistake_entries.source_ref IS
  'Faz 2: UUID olmayan soru kimliği (hazırlık yolu: <attemptId>:q:N, :tf:N, :pc:N, :lc:N). Deneme soruları source_question_id kullanır.';
