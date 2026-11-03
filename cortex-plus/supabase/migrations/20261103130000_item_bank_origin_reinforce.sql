-- Paket 3: "Yeni Pekiştirme Testi" soruları item_bank'a origin='reinforce' ile yazılır.
-- Eklemeli: yalnız izin verilen değer kümesi genişler; mevcut satırlar ('cortex_original') geçerli kalır.
-- Kod bu migration olmadan da çalışır (origin CHECK hatasında qa.origin='reinforce' ile yeniden dener).
ALTER TABLE public.item_bank DROP CONSTRAINT IF EXISTS item_bank_origin_check;
ALTER TABLE public.item_bank
  ADD CONSTRAINT item_bank_origin_check CHECK (origin IN ('cortex_original', 'reinforce'));
