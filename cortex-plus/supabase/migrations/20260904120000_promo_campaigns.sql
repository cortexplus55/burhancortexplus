-- Kampanya bandı.
--
-- Ücretsiz kullanıcıya gösterilen, geri sayımlı duyuru şeridi. Bitiş tarihi
-- burada tutuluyor ve tarih geçtiğinde bant kendiliğinden kayboluyor.
--
-- Sayaç bilerek kendi kendine yenilenmiyor: sürekli sıfırlanan bir geri sayım
-- sahte aciliyet üretir. Kampanya gerçekten bitiyorsa bant da bitiyor; yeni
-- kampanya yönetim panelinden açılıyor.

CREATE TABLE public.promo_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  href text NOT NULL DEFAULT '/pay',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_campaigns_window CHECK (ends_at > starts_at)
);

-- Aynı anda yalnızca bir kampanya gösteriliyor; sorgu buna göre tek satır
-- çekiyor, indeks o sorguyu karşılıyor.
CREATE INDEX promo_campaigns_live_idx
  ON public.promo_campaigns (ends_at DESC)
  WHERE active;

ALTER TABLE public.promo_campaigns ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir: bant giriş yapmış her kullanıcıya görünüyor. Yazma
-- yalnızca yöneticide ve zaten servis anahtarıyla yapılıyor.
CREATE POLICY promo_campaigns_read ON public.promo_campaigns
  FOR SELECT USING (active AND now() BETWEEN starts_at AND ends_at);
