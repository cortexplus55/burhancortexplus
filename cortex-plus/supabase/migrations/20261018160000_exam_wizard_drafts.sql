-- ============================================================================
-- Kurulum sihirbazı taslağı sunucuda (18 Ekim 2026, satışa hazırlık planı 2.3)
--
-- Yarım bırakılan sınav hazırlığı kurulumu yalnız tarayıcıda (localStorage,
-- 24 saat) duruyordu: masaüstünde başlayan öğrenci telefondan açınca kurulum
-- kayboluyordu. Taslak artık kullanıcı başına tek satır olarak burada da durur;
-- hangi kopya yeniyse o açılır. Tarayıcı kopyası kalır (çevrimdışı / anında).
--
-- Yazma yalnız sunucudan (servis anahtarı, /api/learning/exam-prep/draft);
-- öğrenci yalnız kendi satırını okur. Tamamen additive.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.exam_wizard_drafts (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  draft jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_wizard_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_wizard_drafts_own ON public.exam_wizard_drafts FOR SELECT USING (user_id = auth.uid());
