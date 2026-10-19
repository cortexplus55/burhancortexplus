-- Kapalı beta çıkış ölçütleri (19 Ekim 2026, satışa hazırlık Faz 5.3).
--
-- Ölçütler: atılan kavram 0, soğuk ders ilk ekran p95 < 20 sn, hazır ders < 3 sn, ödeme başarısı
-- > %95, destek cevabı < 24 saat, Sentry'de kritik hata 0. İlk ve son ikisi zaten veritabanında ya
-- da Sentry'de; ikisi için kayıt yoktu:
--
-- 1) Ders açılış süresi yalnız Vercel günlüğündeydi (`lesson_first_shown`, `prefetch_served`);
--    Hobby planı günlüğü ~3 gün tutuyor. `open_timings` her açılışın sunucu süresini tutar.
-- 2) Destek talebinin cevaplandığı an hiç yazılmıyordu ve talebi kapatacak bir ekran yoktu:
--    günlük özetin "24 saati geçti" sayısı yalnız büyüyebilirdi. `answered_at` eklendi,
--    /admin/destek "Cevaplandı" ile yazar.
--
-- Yalnız ekleme: yeni tablo, yeni kolon.

CREATE TABLE IF NOT EXISTS public.open_timings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  -- ready: önceden yazılmış içerik verildi · adopted: yazımı süren önceden yazım devralındı ·
  -- cold: hazır içerik yoktu, ilk ekran yazımdan geldi
  path text NOT NULL CHECK (path IN ('ready', 'adopted', 'cold')),
  ms integer NOT NULL CHECK (ms >= 0 AND ms < 600000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS open_timings_created_idx ON public.open_timings (created_at DESC);

ALTER TABLE public.open_timings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.open_timings IS
  'Etkinlik açılışının sunucu süresi (istek başından yanıta, ms). Beta çıkış ölçütleri /admin/beta okur.';

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS answered_at timestamptz;

COMMENT ON COLUMN public.support_requests.answered_at IS
  'Kurucunun cevabı gönderip /admin/destek''te "Cevaplandı" dediği an. Destek sözü 24 saat.';
