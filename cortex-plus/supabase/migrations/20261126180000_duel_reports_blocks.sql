-- UYGULANDI (26 Kasım 2026, ~15:05 UTC): Burhan'ın onayıyla SQL ekranında, kayıt satırıyla birlikte, #732 birleşmeden
-- önce (`docs/operasyon/goc-kayitlari.md`). Kayıt satırı (SQL ekranında aynı çalıştırmada):
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261126180000', 'duel_reports_blocks') on conflict (version) do nothing;
--
-- Düelloda bildir ve engelle (26 Kasım 2026, mobil 1. adım; App Store 1.2 ve Google Play kullanıcı içeriği politikası).
--
-- Düelloda başka oyunculara görünen tek kullanıcı içeriği oyuncunun adı. Uygunsuz adı süzgeç tutar
-- (`display-name-filter.ts`); süzgeçten kaçanı oyuncular bildirir, yönetici gizler; oturumlu öğrenci bir oyuncuyu
-- engelleyince o oyuncu öğrencinin gördüğü sıralamalardan ve kendi kurduğu düellolardan çıkar.
--
-- YALNIZ EKLER: iki yeni tablo ve dizinleri. Var olan hiçbir tablo, sütun ya da kısıt değişmez. Kod bu göç olmadan
-- da çalışır (bildirim ve engelleme "şu an alınamıyor" der, sıralama süzgeçsiz değil yalnız ad süzgeciyle gösterilir).
-- Satır güvenliği açık; tarayıcı rollerine hiçbir izin yok, okuma ve yazma yalnız sunucu anahtarıyla.

CREATE TABLE IF NOT EXISTS public.duel_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id uuid NOT NULL REFERENCES public.prep_duels (id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.prep_duel_runs (id) ON DELETE CASCADE,
  -- Bildiren: oturumlu öğrenci ya da (misafirse) IP'nin geri çevrilemez özeti.
  reporter_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reporter_hash text CHECK (reporter_hash IS NULL OR char_length(reporter_hash) BETWEEN 16 AND 64),
  reported_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  -- Bildirim anındaki görünen ad (yönetici neyin bildirildiğini görsün; ad sonradan gizlenebilir).
  reported_name text NOT NULL CHECK (char_length(reported_name) BETWEEN 1 AND 40),
  reason text NOT NULL CHECK (reason IN ('offensive_name', 'cheating', 'harassment', 'other')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'hidden', 'dismissed')),
  reviewed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  -- Bildirenin en az biri kodda zorunlu; burada kısıt yok: hesap silinince `reporter_id` boşalabilsin.
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Aynı kişi aynı turu bir kez bildirir.
CREATE UNIQUE INDEX IF NOT EXISTS duel_reports_once_user
  ON public.duel_reports (run_id, reporter_id) WHERE reporter_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS duel_reports_once_guest
  ON public.duel_reports (run_id, reporter_hash) WHERE reporter_id IS NULL;
CREATE INDEX IF NOT EXISTS duel_reports_queue_idx ON public.duel_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS duel_reports_duel_idx ON public.duel_reports (duel_id);

CREATE TABLE IF NOT EXISTS public.duel_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  -- Hesaplı oyuncu kişi olarak, misafir oyuncu yalnız o turuyla engellenir.
  blocked_user_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  blocked_run_id uuid REFERENCES public.prep_duel_runs (id) ON DELETE CASCADE,
  -- Engel listesinde gösterilen ad (engelleme anındaki).
  blocked_name text NOT NULL CHECK (char_length(blocked_name) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT duel_blocks_target_check CHECK ((blocked_user_id IS NULL) <> (blocked_run_id IS NULL)),
  CONSTRAINT duel_blocks_not_self CHECK (blocked_user_id IS NULL OR blocked_user_id <> blocker_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS duel_blocks_user_once
  ON public.duel_blocks (blocker_id, blocked_user_id) WHERE blocked_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS duel_blocks_run_once
  ON public.duel_blocks (blocker_id, blocked_run_id) WHERE blocked_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS duel_blocks_blocked_user_idx
  ON public.duel_blocks (blocked_user_id) WHERE blocked_user_id IS NOT NULL;

ALTER TABLE public.duel_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duel_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.duel_reports FROM anon, authenticated;
REVOKE ALL ON public.duel_blocks FROM anon, authenticated;
GRANT ALL ON public.duel_reports TO service_role;
GRANT ALL ON public.duel_blocks TO service_role;
