-- Günü gelen tekrar (20 Ekim 2026, ürün sahibinin kararı): yanlış yapılan sorular ve dersin sınav
-- noktaları 1-3-7-14 gün sonra (sınav gününden önceye sınırlı) kendiliğinden yeniden sorulur;
-- hazırlık sayfasında "Bugün N tekrar". Yolu kilitlemez: düğüm değil, yolun dışında bir kayıt.
--
-- Satır, denetimden geçmiş bir sorunun KOPYASIDIR (şıklar ve doğru cevap dahil); model çağrısı
-- yok, metin yeniden yazılmaz, sunarken yalnız şık sırası karışır. Var olan tablolar bunu
-- tutamıyordu: `adaptive_scheduled_reviews` konu başına (soru ve cevap yok), `mistake_entries`
-- kullanıcı başına (hazırlık yok, "üst üste iki doğru" kuralı), `exam_prep_misconceptions`
-- yalnız soru önizlemesi tutuyor (şık ve cevap yok).
--
-- Doğru cevap tabloda durduğu için yazma ve okuma yalnız sunucudan (service_role); satır
-- güvenliği açık, politika yok — öğrencinin oturum anahtarı satırı göremez. Hazırlık silinince
-- satırlar CASCADE ile gider; hesap silinince `purgeUserData` siler.
--
-- Yalnız ekleme: yeni tablo, yeni özellik anahtarı.

CREATE TABLE IF NOT EXISTS public.exam_prep_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL REFERENCES public.exam_preps(id) ON DELETE CASCADE,
  topic_id uuid,
  topic_label text,
  -- Yabancı anahtar yok: yeniden planlama düğümleri yeniden kurabilir; satır bir kopya.
  node_id uuid,
  attempt_id uuid,
  source_kind text NOT NULL CHECK (source_kind IN ('lesson_check', 'quiz', 'true_false', 'oral', 'card')),
  -- miss: yanlış (1 günden başlar) · exam_point: dersin sınav noktası, doğru cevaplandı (3 günden başlar)
  reason text NOT NULL CHECK (reason IN ('miss', 'exam_point')),
  -- Satırı son kez kuran ya da sıfırlayan olay: `${attemptId}:${kind}:${index}`. Aynı tamamlama iki kez
  -- gelirse ikinci kez sıfırlamaz.
  source_ref text NOT NULL,
  prompt_key text NOT NULL CHECK (char_length(prompt_key) BETWEEN 4 AND 600),
  -- Soru, şıklar ve doğru cevap. Tarayıcıya bütünüyle gitmez; cevap sunucuda notlanır.
  item jsonb NOT NULL,
  -- 0..3 = 1 / 3 / 7 / 14 gün
  interval_step smallint NOT NULL DEFAULT 0 CHECK (interval_step BETWEEN 0 AND 3),
  -- İstanbul takvim günü
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'learned', 'expired')),
  ask_count integer NOT NULL DEFAULT 0 CHECK (ask_count >= 0),
  correct_count integer NOT NULL DEFAULT 0 CHECK (correct_count >= 0 AND correct_count <= ask_count),
  lapse_count integer NOT NULL DEFAULT 0 CHECK (lapse_count >= 0),
  last_answered_on date,
  last_result boolean,
  -- Yönetim ölçüsü (/admin/beta): yanlışın 7 gün içinde yeniden sorulma payı ve ilk tekrarda doğru.
  first_missed_on date,
  first_reasked_on date,
  first_reask_correct boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_prep_id, prompt_key)
);

CREATE INDEX IF NOT EXISTS exam_prep_review_items_due_idx
  ON public.exam_prep_review_items (user_id, exam_prep_id, due_on)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS exam_prep_review_items_missed_idx
  ON public.exam_prep_review_items (first_missed_on)
  WHERE first_missed_on IS NOT NULL;

ALTER TABLE public.exam_prep_review_items ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.exam_prep_review_items IS
  'Günü gelen tekrar: yanlış soru ve dersin sınav noktası 1-3-7-14 gün sonra hazırlık sayfasında yeniden sorulur. Kopya öğe (cevabıyla); yalnız service_role.';

-- Yönetim panelinden kapatılabilsin (Özellik anahtarları). Varsayılan açık.
INSERT INTO public.feature_flags (key, enabled, description)
VALUES ('spaced_review', true, 'Aralıklı tekrar: kaçırılan soru ve sınav noktası 1-3-7-14 gün sonra hazırlık sayfasında "Bugün N tekrar".')
ON CONFLICT (key) DO NOTHING;
