-- Yanıt geri bildirimi.
--
-- Öğrenci bir yanıtın altındaki başparmağa bastığında burası doluyor. Amaç
-- "kaç beğeni aldık" değil: kötü bulunan yanıtları toplayıp AI talimatlarını
-- ona göre düzeltmek. Bu yüzden olumsuz oyda kısa bir sebep de tutuluyor.

ALTER TABLE public.messages
  ADD COLUMN rating smallint,
  ADD COLUMN rating_reason text,
  ADD COLUMN rated_at timestamptz;

-- Yalnızca +1 ve -1. Yıldız ya da 1-5 puan bilerek yok: öğrenciye "bu yanıt
-- işine yaradı mı" dışında bir soru sormak, cevap oranını düşürüyor.
ALTER TABLE public.messages
  ADD CONSTRAINT messages_rating_range
  CHECK (rating IS NULL OR rating IN (-1, 1));

-- Sebep yalnızca olumsuz oyla anlamlı.
ALTER TABLE public.messages
  ADD CONSTRAINT messages_rating_reason_scope
  CHECK (rating_reason IS NULL OR rating = -1);

-- Yönetim panelindeki liste "en yeni olumsuz oy" sırasıyla okunuyor;
-- kısmi indeks yalnızca oylanmış satırları tutuyor, o da azınlık.
CREATE INDEX messages_rated_idx
  ON public.messages (rated_at DESC)
  WHERE rating IS NOT NULL;
