-- Göç dosyalarının şemaya UYGULANDIĞINDA ne yaptığını ölçen testler.
--
-- Birim testleri SQL METNİNİ okuyor: bir dosyada doğru kelimelerin geçtiğini
-- doğrulayabiliyor ama şemayı kurmuyor, fonksiyonu çalıştırmıyor. Haftalık
-- paket tam bu boşluktan geçti — metin doğruydu, davranış yanlıştı:
--
--   • `finalize_paytr_payment` cüzdan penceresini ödeme anında 30 güne
--     sabitliyordu; haftalık abone 349 TL'ye aldığı 150 krediyi bir ay
--     boyunca harcayabiliyordu.
--   • `credit_reserve` yenileme dalı `period_kind = 'weekly'` yazıyordu ama
--     CHECK kısıtı bunu kabul etmiyordu; dal ilk çalıştığında patlardı.
--
-- İkisi de ancak yerel bir Postgres'te zincir çalıştırılınca görüldü.
--
-- Çalıştırmak için: scripts/verify-migrations.sh

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(
  p_ok boolean, p_ad text, p_beklenen text, p_gercek text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok THEN
    RAISE NOTICE 'GEÇTİ  %', p_ad;
  ELSE
    RAISE EXCEPTION 'KALDI  % — beklenen: %, gerçek: %', p_ad, p_beklenen, p_gercek;
  END IF;
END $$;

-- --- Sahne ---------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'paket@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'haftalik@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'aylik@test.local');

INSERT INTO public.profiles (id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000002'),
  ('aaaaaaaa-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.payments
  (user_id, beneficiary_user_id, plan_id, merchant_oid, amount_try, status)
SELECT u.id, u.id, p.id, u.oid, p.price_try, 'pending'
  FROM (VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'ek-kredi-150',  'OID_PACK'),
    ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'plus-haftalik', 'OID_WEEK'),
    ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'plus-aylik',    'OID_MONTH')
  ) AS u(id, slug, oid)
  JOIN public.plans p ON p.slug = u.slug;

DO $$
BEGIN
  PERFORM public.finalize_paytr_payment('OID_PACK',  'h1', 'success', '{}'::jsonb);
  PERFORM public.finalize_paytr_payment('OID_WEEK',  'h2', 'success', '{}'::jsonb);
  PERFORM public.finalize_paytr_payment('OID_MONTH', 'h3', 'success', '{}'::jsonb);
END $$;

-- --- Kredi paketi abonelik AÇMAMALI --------------------------------------
--
-- `finalize_paytr_payment` bir ödemenin abonelik mi kredi yüklemesi mi
-- olduğuna plan ADINA da bakıyor: adında 'plus', 'sigma' ya da 'premium'
-- geçen plan abonelik sayılıyor. "Plus Kredi Paketi" gibi bir isim 329 TL'ye
-- premium dağıtırdı. Paketler bu yüzden "Ek Kredi" adını taşıyor.

DO $$
DECLARE v_kredi integer; v_abone integer;
BEGIN
  SELECT balance INTO v_kredi FROM public.credit_wallets
   WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_abone FROM public.subscriptions
   WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND status = 'active';

  PERFORM pg_temp.assert(v_kredi = 150,
    'kredi paketi krediyi yüklüyor', '150', v_kredi::text);
  PERFORM pg_temp.assert(v_abone = 0,
    'kredi paketi abonelik AÇMIYOR', '0', v_abone::text);
END $$;

-- --- Abonelik gerçekten abonelik açmalı -----------------------------------

DO $$
DECLARE v_abone integer;
BEGIN
  SELECT count(*) INTO v_abone FROM public.subscriptions
   WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000003' AND status = 'active';
  PERFORM pg_temp.assert(v_abone = 1,
    'aylık abonelik açılıyor', '1', v_abone::text);
END $$;

-- --- Abonelik süresi plandan gelmeli --------------------------------------

DO $$
DECLARE v_hafta integer; v_ay integer;
BEGIN
  SELECT round(EXTRACT(epoch FROM (s.current_period_end - now())) / 86400)::int
    INTO v_hafta FROM public.subscriptions s
   WHERE s.user_id = 'aaaaaaaa-0000-0000-0000-000000000002' AND s.status = 'active';
  SELECT round(EXTRACT(epoch FROM (s.current_period_end - now())) / 86400)::int
    INTO v_ay FROM public.subscriptions s
   WHERE s.user_id = 'aaaaaaaa-0000-0000-0000-000000000003' AND s.status = 'active';

  PERFORM pg_temp.assert(v_hafta = 7,  'haftalık abonelik 7 gün', '7',  v_hafta::text);
  PERFORM pg_temp.assert(v_ay    = 30, 'aylık abonelik 30 gün',   '30', v_ay::text);
END $$;

-- --- KOTA PENCERESİ de plandan gelmeli ------------------------------------
--
-- Kaçan hata buydu: abonelik süresi doğruydu, pencere değildi.

DO $$
DECLARE v_kind text; v_gun integer; v_hak integer;
BEGIN
  SELECT period_kind,
         round(EXTRACT(epoch FROM (period_ends_at - date_trunc('day', now()))) / 86400)::int,
         period_allowance
    INTO v_kind, v_gun, v_hak
    FROM public.credit_wallets
   WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000002';

  PERFORM pg_temp.assert(v_kind = 'weekly',
    'haftalık cüzdan penceresi weekly', 'weekly', v_kind);
  PERFORM pg_temp.assert(v_gun = 7,
    'haftalık kota penceresi 7 gün', '7', v_gun::text);
  PERFORM pg_temp.assert(v_hak = 150,
    'haftalık hak 150 kredi', '150', v_hak::text);

  SELECT period_kind,
         round(EXTRACT(epoch FROM (period_ends_at - date_trunc('day', now()))) / 86400)::int
    INTO v_kind, v_gun
    FROM public.credit_wallets
   WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000003';

  PERFORM pg_temp.assert(v_kind = 'monthly',
    'aylık cüzdan penceresi monthly', 'monthly', v_kind);
  PERFORM pg_temp.assert(v_gun = 30,
    'aylık kota penceresi 30 gün', '30', v_gun::text);
END $$;

-- --- credit_reserve haftalıkta kısıt ihlali vermemeli ---------------------
--
-- Yenileme dalı 'weekly' yazıyor; CHECK kısıtı bunu kabul etmezse öğrencinin
-- sohbeti 500 ile düşer.

DO $$
DECLARE v_rez uuid;
BEGIN
  SELECT public.credit_reserve(
    'aaaaaaaa-0000-0000-0000-000000000002', 'AI_CHAT_STANDARD', 'test-weekly'
  ) INTO v_rez;
  PERFORM pg_temp.assert(v_rez IS NOT NULL,
    'haftalık abonede kredi ayrılabiliyor', 'uuid', 'NULL');
END $$;

-- --- Model fiyatları tohumlanmış olmalı -----------------------------------

DO $$
DECLARE v_adet integer;
BEGIN
  SELECT count(*) INTO v_adet FROM public.ai_model_prices;
  PERFORM pg_temp.assert(v_adet >= 5,
    'model fiyatları tohumlandı', '>=5', v_adet::text);
END $$;

ROLLBACK;
