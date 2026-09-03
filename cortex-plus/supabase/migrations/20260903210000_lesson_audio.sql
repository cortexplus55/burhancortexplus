-- ============================================================================
-- Faz 4 — Sunucu tarafı ses
--
-- Podcast bugüne kadar tarayıcının speechSynthesis'iyle okunuyordu: cihazda
-- Türkçe ses yoksa ders sessiz kalıyordu ve ileri/geri sarma yoktu. Ses artık
-- sunucuda üretiliyor.
--
-- Önbellek içerik adresli: anahtar, cümle metni + konuşmacı + model karması.
-- Aynı cümle bir daha üretilmiyor — okul akışında forklanan hazırlıklar aynı
-- konuları işlediği için bu, tekrar üretimin büyük kısmını kesiyor.
--
-- Tablo istemciye hiç açılmıyor: RLS açık ve tek bir politika yok, yani yalnız
-- service role okuyup yazabiliyor. Ses dosyaları imzalı URL ile veriliyor.
--
-- Tamamen additive. Editör notu: satır sonunda çıplak THEN bırakmayın.
-- ============================================================================

-- --- 1) Ses önbelleği -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lesson_audio (
  hash text PRIMARY KEY,
  storage_path text NOT NULL,
  duration_ms integer NOT NULL,
  voice text NOT NULL,
  chars integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lesson_audio_last_used_idx ON public.lesson_audio (last_used_at);

ALTER TABLE public.lesson_audio ENABLE ROW LEVEL SECURITY;

-- --- 2) Ses kovası ----------------------------------------------------------
-- Gizli kova: dosyalar yalnızca kısa ömürlü imzalı URL ile veriliyor.
INSERT INTO storage.buckets (id, name, public)
VALUES ('lesson-audio', 'lesson-audio', false)
ON CONFLICT (id) DO NOTHING;
