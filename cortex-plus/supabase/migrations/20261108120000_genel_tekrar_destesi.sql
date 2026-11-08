-- Genel tekrar destesi (8 Kasım 2026, ürün sahibinin kararı): sohbetin "Akılda kalsın" kartındaki bilgiler
-- "Tekrarıma ekle" ile öğrencinin destesine girer ve 1-3-7-14 gün sonra boşluk doldurma kartı olarak geri gelir.
-- Hazırlıktan bağımsız (öğrencinin hazırlığı olmayabilir); hazırlıkların günü gelen tekrarı
-- (`exam_prep_review_items`) ayrı kalır.
--
-- Kartın sorusu ve cevabı öğretmenin kendi cümlesinden kodla kurulur (kilit bilgi boşluk olur); model çağrısı yok.
-- Yazma ve okuma yalnız sunucudan (service_role): satır güvenliği açık, politika yok. Hesap silinince
-- `purgeUserData` siler.
--
-- Yalnız ekleme: yeni tablo ve dizin.

CREATE TABLE IF NOT EXISTS public.general_review_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'chat' CHECK (source IN ('chat')),
  -- Kartın sorusu (kilit bilgi "_____") ve cevabı (kilit bilgi).
  front text NOT NULL CHECK (char_length(front) BETWEEN 4 AND 600),
  back text NOT NULL CHECK (char_length(back) BETWEEN 1 AND 200),
  -- Aynı kart ikinci kez eklenmesin: sorunun özeti (16 hex).
  card_key text NOT NULL CHECK (char_length(card_key) BETWEEN 8 AND 64),
  -- 0..3 = 1 / 3 / 7 / 14 gün
  interval_step smallint NOT NULL DEFAULT 0 CHECK (interval_step BETWEEN 0 AND 3),
  -- İstanbul takvim günü
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'learned')),
  ask_count integer NOT NULL DEFAULT 0 CHECK (ask_count >= 0),
  correct_count integer NOT NULL DEFAULT 0 CHECK (correct_count >= 0 AND correct_count <= ask_count),
  last_answered_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, card_key)
);

CREATE INDEX IF NOT EXISTS general_review_cards_due_idx
  ON public.general_review_cards (user_id, due_on)
  WHERE status = 'active';

ALTER TABLE public.general_review_cards ENABLE ROW LEVEL SECURITY;
