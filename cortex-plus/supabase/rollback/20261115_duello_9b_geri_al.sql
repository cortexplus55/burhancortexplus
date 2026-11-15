-- Düello 9B geri alma: 20261115140000_duel_generate_credits.sql göçünün tersi. GÖÇ DEĞİL; yalnız Burhan SQL ekranında
-- çalıştırır.
--
-- Önce bayrak: /admin/feature-flags → "Düello · yeni kurma kuralları (9B)" → Kapat ya da "Benden kaldır". En geç 30 sn'de
-- bugünkü düello (QUIZ_GENERATE, 10 kredi, günlük sınır yok) geri gelir. Bayrak kapalıyken DUEL_GENERATE hiç kullanılmaz;
-- bu SQL'e yalnız kod da geri alınırsa gerek var. (Kod fiyat tablosunda DUEL_GENERATE taşırken satır kapanırsa
-- /admin/sistem "Kredi kuralı satırları" kritik der: önce kod, sonra bu SQL.)
--
-- Satır silinmez, kapatılır: DUEL_GENERATE ile yazılmış ayırma ve defter satırları (credit_reservations, credit_ledger)
-- anlamını korur. Başka satıra, tabloya ya da sütuna dokunmaz.

begin;

update public.credit_rules
   set active = false,
       updated_at = now()
 where action_code = 'DUEL_GENERATE';

commit;
