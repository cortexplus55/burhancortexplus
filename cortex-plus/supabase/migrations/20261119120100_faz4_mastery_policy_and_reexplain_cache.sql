-- Faz 4 / ADIM 2 — Akıllı kavrama (19 Kasım 2026, Burhan'ın kararı, t307u). Yalnız ekleme: yeni sütun ve yeni tablo.
-- Var olan satır, sütun ve politika değişmez; iki kez çalışınca aynı sonuç.
--
-- 1) exam_prep_topic_mastery.policy (jsonb, boş olabilir): mastery-policy.ts'nin konu kararı — ağırlıklı ve sönümlü
--    yüzde (adjustedPct), rozet (learned / developing / weak / unmeasured), bağımsız doğru, ayrı değerlendirme adımı,
--    nesnel kaynak sayısı, son yanlışlar ve yönlendirme sinyali. Bütün ekranlar (Yol, İlerleme, Kazanç Kartı,
--    Değerlendirme, Hazırsın) aynı alanı okur. Eski satırda NULL: ekran eski sayımdan hesaplar.
-- 2) exam_prep_step_reexplains: "Farklı anlat" adım başına önbellek. Aynı adımın aynı sıradaki anlatımı kayıttan döner
--    (kredi, kullanım kaydı ve model çağrısı yok). Öğrenci yalnız kendi satırını okur; yazma sunucuda (service_role).
-- Kayıt satırı aynı çalıştırmada, sona:
--   insert into supabase_migrations.schema_migrations (version, name)
--     values ('20261119120100', 'faz4_mastery_policy_and_reexplain_cache') on conflict (version) do nothing;

ALTER TABLE public.exam_prep_topic_mastery ADD COLUMN IF NOT EXISTS policy jsonb;

CREATE TABLE IF NOT EXISTS public.exam_prep_step_reexplains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES public.exam_prep_nodes(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  variant smallint NOT NULL DEFAULT 0 CHECK (variant >= 0 AND variant <= 9),
  reply text NOT NULL CHECK (char_length(reply) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, node_id, step_key, variant)
);

CREATE INDEX IF NOT EXISTS exam_prep_step_reexplains_prep_idx
  ON public.exam_prep_step_reexplains (exam_prep_id);

ALTER TABLE public.exam_prep_step_reexplains ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'exam_prep_step_reexplains' AND policyname = 'step_reexplains_own_read'
  ) THEN
    CREATE POLICY step_reexplains_own_read ON public.exam_prep_step_reexplains
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

REVOKE ALL ON public.exam_prep_step_reexplains FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.exam_prep_step_reexplains FROM authenticated;
GRANT SELECT ON public.exam_prep_step_reexplains TO authenticated;
GRANT ALL ON public.exam_prep_step_reexplains TO service_role;
