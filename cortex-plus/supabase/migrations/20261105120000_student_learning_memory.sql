-- Öğrenci öğrenme hafızası (5 Kasım 2026): öğrencinin kendi kayıtlarından MODELSİZ hesaplanan uzun süreli özet
-- (yanlış türleri, zayıf kazanımlar, açık yanılgılar, tekrar eden yanlış konuları, tercih ve tempo).
-- Öğretmen sohbeti, sesli çalışma ve ders yazımı bu özeti bir-üç satır olarak okur; /ilerleme kart gösterir.
--
-- Yalnız ekleme. Satır güvenliği açık, politika yok: yalnız service_role okur ve yazar (sunucu).
-- Hesap silinince CASCADE; silme işçisi de tabloyu listesinde taşır (`src/lib/privacy/account-deletion.ts`).
-- Kod tablo yokken de çalışır: okuma null döner, yazma `console.warn` ile atlanır.

CREATE TABLE IF NOT EXISTS public.student_learning_memory (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  memory jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.student_learning_memory IS
  'Öğrencinin uzun süreli öğrenme özeti; kayıtlardan modelsiz hesaplanır, öğretmen sohbeti ve ders yazımı okur.';
COMMENT ON COLUMN public.student_learning_memory.memory IS
  'StudentMemory JSON (src/lib/learning/student-memory/summary.ts); version alanı şema sürümü.';

ALTER TABLE public.student_learning_memory ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.student_learning_memory TO service_role;
