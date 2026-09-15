-- Kredi paketleri ("ek paket") — kredisi biten öğrenci beklemek zorunda kalmasın.
--
-- Bu bir özellik eklemesi DEĞİL, eksik üç veri satırı. Mekanizma zaten
-- tamamdı: `billing_period = 'one_time'` şeması duruyordu, PayTR geri çağrısı
-- `credit_amount` kadar krediyi cüzdana yazıp `credit_ledger`e
-- 'purchase' satırı düşüyordu, arayüzdeki `subscription-cards.tsx` bu planları
-- abonelik kartlarının altındaki bölümde zaten render ediyordu. Satılacak bir
-- plan satırı yoktu, o kadar.
--
-- ============================ DİKKAT — ADLANDIRMA ==========================
--
-- `settle_paytr_callback` bir ödemenin abonelik mi kredi yüklemesi mi
-- olduğuna şuna bakarak karar veriyor:
--
--     v_is_subscription := COALESCE(v_plan.is_premium, false)
--       OR lower(COALESCE(v_plan.name, '')) LIKE ANY
--          (ARRAY['%plus%', '%sigma%', '%premium%']);
--
-- Yani paketin ADINDA "plus", "sigma" ya da "premium" geçerse ödeme abonelik
-- sayılır ve öğrenci 129 TL'ye premium olur. Bu yüzden paket adları bilerek
-- "Ek Kredi" — pazarlama dili uğruna "Plus Kredi Paketi" gibi bir isim
-- konulursa bedava premium dağıtılır. Yeni paket eklerken bu satırı okuyun.
--
-- `is_premium = false` da aynı nedenle şart: tek başına da aboneliği tetikler.
--
-- ============================== FİYATLANDIRMA ==============================
--
-- Paket kredisi abonelik kredisinden PAHALI. Ucuz olsaydı kimse abone olmaz,
-- herkes paket alırdı; paketin işi aboneliği ikame etmek değil, ayın ortasında
-- kredisi biten aboneyi beklemekten kurtarmak.
--
-- Bugünkü satış fiyatlarından türetildi (Plus 400 kredi / 599 TL = 1,50 TL
-- kredi; Sigma 1600 / 1.999 TL = 1,25 TL):
--
--   50 kredi  → 129 TL  = 2,58 TL/kredi
--   150 kredi → 329 TL  = 2,19 TL/kredi
--   400 kredi → 749 TL  = 1,87 TL/kredi
--
-- Üçü de abonelik biriminin üstünde, indirim paketle birlikte artıyor. En
-- büyük paket bilerek bir aylık Plus'tan pahalı: 400 krediye bakan ücretsiz
-- kullanıcının doğru cevabı paket değil abonelik.
--
-- Bunlar veritabanı satırı — fiyat değişikliği kod değişikliği gerektirmiyor.
-- İlk öğrencilerden gerçek kullanım verisi geldiğinde yeniden bakılacak.

INSERT INTO public.plans
  (slug, name, description, price_try, credit_amount, is_premium, active,
   sort_order, billing_period, tier, period_days, monthly_allowance)
VALUES
  ('ek-kredi-50',  'Ek Kredi 50',  'Kısa bir sıkışıklık için',        12900,  50, false, true, 20, 'one_time', NULL, NULL, NULL),
  ('ek-kredi-150', 'Ek Kredi 150', 'Ayın ortasında kredin bitti ise', 32900, 150, false, true, 21, 'one_time', NULL, NULL, NULL),
  ('ek-kredi-400', 'Ek Kredi 400', 'Yoğun sınav dönemi',              74900, 400, false, true, 22, 'one_time', NULL, NULL, NULL)
ON CONFLICT (slug) DO UPDATE SET
  name           = EXCLUDED.name,
  description    = EXCLUDED.description,
  price_try      = EXCLUDED.price_try,
  credit_amount  = EXCLUDED.credit_amount,
  is_premium     = EXCLUDED.is_premium,
  active         = EXCLUDED.active,
  sort_order     = EXCLUDED.sort_order,
  billing_period = EXCLUDED.billing_period,
  updated_at     = now();

-- NOT: ilk kurulumdan kalan `baslangic` ve `pro` planları (99 / 499 TL)
-- hâlâ tabloda. Bugünkü satışla ilgileri yok ama BU MIGRATION ONLARA
-- DOKUNMUYOR: satıştan çekmek bir fiyatlandırma kararı ve ürün sahibinin
-- vereceği karar, göç dosyasının yan etkisi değil. Satılıyorlarsa
-- yönetim panelinden kapatılabilir.
