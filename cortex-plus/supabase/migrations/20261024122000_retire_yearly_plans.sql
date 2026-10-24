-- Yıllık planlar satıştan kalkar (24 Ekim 2026, ürün sahibinin kararı): yıllık Plus ₺2.990'da abone başına
-- ayda ~₺200 bırakıyordu ve hiçbir senaryoda kâra katkısı yoktu (docs/delivery/MALIYET-VERGI-24-EKIM.md).
-- Satışta yalnız aylık ve haftalık kalır. Satırlar silinmez: abonelik ve ödeme kayıtları onlara bağlı,
-- elinde yıllık abonelik olan dönem sonuna kadar Plus kalır (credit_reserve ve ödeme fonksiyonları planı
-- kimliğiyle okur, `active` süzgeci yok).
--
-- 1) Önce ek okuma izni: plans_public yalnız `active = true` satırları gösteriyor; satıştan kalkan planı
--    elinde tutan öğrencinin oturumlu okumaları (kabuk, /pay, /odemeler) planı göremeyip onu ücretsiz
--    sanırdı. Eski politika durur; Postgres SELECT politikalarını VEYA ile birleştirir.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'plans' AND policyname = 'plans_held_by_user') THEN
    CREATE POLICY plans_held_by_user ON public.plans FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.plan_id = plans.id AND s.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.payments p
         WHERE p.plan_id = plans.id AND (p.user_id = auth.uid() OR p.beneficiary_user_id = auth.uid())
      )
    );
  END IF;
END $$;

-- 2) Satıştan kaldır. 20260906130000_subscription_billing.sql yeniden uygulanmamalı: oradaki upsert
--    yıllıkları yeniden satışa açar.
UPDATE public.plans SET active = false, updated_at = now()
 WHERE slug IN ('plus-yillik', 'sigma-yillik') AND active = true;
