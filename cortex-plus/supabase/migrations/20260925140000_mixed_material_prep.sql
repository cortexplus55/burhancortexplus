-- Karışık materyal: konu kaynakları, çelişki uyarısı, elle sıra, zor soru önbelleği.
-- Elle Supabase SQL editöründe çalıştırılır. Kolonlar yokken uygulama düşmez;
-- uyarı ve önbellek göçten sonra yazılır.

ALTER TABLE public.exam_prep_topics
  ADD COLUMN IF NOT EXISTS source_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.exam_prep_topics
  ADD COLUMN IF NOT EXISTS contradictions jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.exam_preps
  ADD COLUMN IF NOT EXISTS topic_order_manual boolean NOT NULL DEFAULT false;

ALTER TABLE public.exam_preps
  ADD COLUMN IF NOT EXISTS challenge_set jsonb;

COMMENT ON COLUMN public.exam_prep_topics.source_refs IS
  'Konunun dayandığı dosyalar: documentId, fileName, pages, nodeId.';
COMMENT ON COLUMN public.exam_prep_topics.contradictions IS
  'Aynı kavram için çelişen kaynak iddiaları. Sessizce biri seçilmez.';
COMMENT ON COLUMN public.exam_preps.topic_order_manual IS
  'Öğrenci konu sırasını elle değiştirdiyse true. Önkoşul sırası o zaman yazılmaz.';
COMMENT ON COLUMN public.exam_preps.challenge_set IS
  'Zor soru seti. Aynı dosya listesi için yeniden üretilmez.';

-- Başlık çifti kararı. Belge metni yok; yalnızca katlanmış başlık anahtarı ve evet/hayır.
CREATE TABLE IF NOT EXISTS public.topic_merge_cache (
  pair_key text PRIMARY KEY,
  same boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.topic_merge_cache ENABLE ROW LEVEL SECURITY;
