-- Kötüye kullanım sinyalleri.
--
-- Karar (5 Eylül 2026): sistem önce yalnızca gözlemliyor. Eşiği aşan hesap
-- kapatılmıyor, kapatılsaydı yayın haftasında gerçek bir öğrenciyi kapıda
-- bırakma riski, sömürünün maliyetinden büyük olurdu. Burada biriken veriyle
-- eşikleri gerçek kullanımdan öğrenip sonra otomatiğe alıyoruz.
--
-- IP neden açık yazılmıyor: ham IP kişisel veri. Sömürüyü yakalamak için
-- "aynı yerden mi geliyor" bilgisi yeterli, "nereden geliyor" gerekmiyor.
-- Bu yüzden `APP_SECRET` ile karılmış özet saklanıyor; eşitlik karşılaştırması
-- yapılabiliyor, geriye çevirmek mümkün değil.

CREATE TABLE public.abuse_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Giriş yapmamış istekte boş kalır; hesap silinirse olay kaybolmasın diye
  -- CASCADE değil SET NULL.
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- 'rate_limit' | 'daily_cap' | 'moderation' | 'multi_account' |
  -- 'token_bruteforce' | 'storage_cap' | 'session_spread'
  signal text NOT NULL,

  -- 'low'   : tek başına anlamsız, toplamı anlamlı (bir kez sınıra takılmak)
  -- 'medium': bakılmayı hak eder (gün boyu tavana yaslanmak)
  -- 'high'  : insan gözü görmeli (zararlı içerik, kod deneme saldırısı)
  severity text NOT NULL DEFAULT 'low',

  -- Hangi uç: 'chat', 'solve-image', 'signup' …
  scope text,

  ip_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT abuse_events_severity CHECK (severity IN ('low', 'medium', 'high'))
);

-- Admin sayfası "son 7 gün, en çok takılanlar" diye soruyor; sıralama ve
-- kullanıcı kırılımı bu iki indeksten geçiyor.
CREATE INDEX abuse_events_created_idx ON public.abuse_events (created_at DESC);
CREATE INDEX abuse_events_user_idx ON public.abuse_events (user_id, created_at DESC);
CREATE INDEX abuse_events_signal_idx ON public.abuse_events (signal, created_at DESC);

ALTER TABLE public.abuse_events ENABLE ROW LEVEL SECURITY;

-- Yazma yalnızca servis anahtarıyla (politika yok = anon/authenticated yazamaz).
-- Okuma yalnızca yönetici.
CREATE POLICY abuse_events_admin_read ON public.abuse_events
  FOR SELECT USING (public.is_admin(auth.uid()));
