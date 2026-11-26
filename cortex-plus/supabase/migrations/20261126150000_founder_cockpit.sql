-- UYGULANDI (26 Kasım 2026, ~10:40 UTC): Burhan'ın onayıyla SQL ekranında, kayıt satırıyla birlikte
-- (`docs/operasyon/goc-kayitlari.md`). Kayıt satırı (SQL ekranında aynı oturumda):
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261126150000', 'founder_cockpit') on conflict (version) do nothing;
--
-- Faz 13, Kurucu Kokpiti (/admin/kokpit): sistem sağlığı, günlük OpenAI bütçesi ve koruma modu, kasa/vergi ayrımı,
-- Türkiye vergi takvimi. Dört yeni tablo:
--   founder_cockpit_settings  tekil ayar satırı (id = 'default'): şirket türü, oranlar, kur, bütçe, alarm adresi, koruma modu
--   founder_cloud_expenses    yurt dışı API ve bulut faturaları (2 No.lu KDV ve mali müşavir paketi için)
--   founder_health_snapshots  sağlık kontrolü kayıtları (15 dakikada bir; 30 günden eskisi günlük işte temizlenir)
--   founder_alert_logs        gönderilen alarm ve hatırlatmalar (aynı anahtar 60 dakikada bir; vergi hatırlatması bir kez)
--
-- Ürün sahibinin kararları (26 Kasım 2026): şirket türü varsayılanı 'sahis' (satıcı bilgisi: şahıs işletmesi); dolar kuru
-- tek kaynak (Ana Kokpit ve Birim Ekonomisi de bu satırı okur); alarm adresi operasyon e-postası.
--
-- Erişim: satır güvenliği açık, politika yok; tarayıcı rolleri hiçbir şey okuyamaz ve yazamaz (REVOKE). Okuma ve yazma
-- yalnız sunucu anahtarıyla, kurucu yetkisi denetlenen uçlardan ve CRON_SECRET'li zamanlanmış işlerden.
--
-- Yalnız ekleme: dört yeni tablo, dizinleri ve tek ayar satırı. Var olan hiçbir tablo, sütun, kısıt ya da satır değişmez;
-- DROP, ALTER (var olan tabloda), DELETE, UPDATE yok. İki kez çalıştırmak zararsız (IF NOT EXISTS, ON CONFLICT DO NOTHING).
-- YAYIN SIRASI: kod göçsüz de çalışır (ayarlar varsayılanlarla okunur, kayıt yazımı atlanır, ekran "göç bekliyor" der).

CREATE TABLE IF NOT EXISTS public.founder_cockpit_settings (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  company_type text NOT NULL DEFAULT 'sahis' CHECK (company_type IN ('sahis', 'limited')),
  corporate_tax_rate numeric(5, 4) NOT NULL DEFAULT 0.25 CHECK (corporate_tax_rate BETWEEN 0 AND 1),
  income_tax_rate numeric(5, 4) NOT NULL DEFAULT 0.20 CHECK (income_tax_rate BETWEEN 0 AND 1),
  young_entrepreneur_exempt boolean NOT NULL DEFAULT false,
  vat_rate numeric(5, 4) NOT NULL DEFAULT 0.20 CHECK (vat_rate BETWEEN 0 AND 1),
  paytr_commission_rate numeric(6, 5) NOT NULL DEFAULT 0.0295 CHECK (paytr_commission_rate BETWEEN 0 AND 1),
  usd_try_rate numeric(10, 4) NOT NULL DEFAULT 50.42 CHECK (usd_try_rate BETWEEN 1 AND 1000),
  alert_email text NOT NULL DEFAULT 'cortexplus@cortexplus.app' CHECK (char_length(alert_email) BETWEEN 3 AND 254),
  daily_ai_budget_usd numeric(10, 2) NOT NULL DEFAULT 50 CHECK (daily_ai_budget_usd BETWEEN 1 AND 100000),
  circuit_breaker_enabled boolean NOT NULL DEFAULT false,
  circuit_breaker_triggered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tek ayar satırı. Kur tek kaynak: kurucunun eski kokpitte kaydettiği kur (feature_flags.admin_usd_try → metadata.rate;
-- canlıda 23 Kasım 2026'da 51 kaydedilmişti) varsa yeni satır onunla başlar, yoksa sütun varsayılanıyla. Yalnız satır ilk
-- kez yazılırken okunur (ON CONFLICT DO NOTHING): sonradan kokpitten değiştirilen kur ikinci çalıştırmada ezilmez.
-- feature_flags tablosu olmayan veritabanında (test) okuma atlanır.
DO $$
DECLARE
  saved_rate numeric := NULL;
BEGIN
  IF to_regclass('public.feature_flags') IS NOT NULL THEN
    EXECUTE $read$
      SELECT CASE WHEN (metadata->>'rate') ~ '^[0-9]+([.][0-9]+)?$' THEN (metadata->>'rate')::numeric END
      FROM public.feature_flags
      WHERE key = 'admin_usd_try'
    $read$ INTO saved_rate;
  END IF;
  INSERT INTO public.founder_cockpit_settings (id, usd_try_rate)
  VALUES ('default', CASE WHEN saved_rate BETWEEN 1 AND 1000 THEN saved_rate ELSE 50.42 END)
  ON CONFLICT (id) DO NOTHING;
END $$;

CREATE TABLE IF NOT EXISTS public.founder_cloud_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month text NOT NULL CHECK (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  vendor text NOT NULL CHECK (vendor IN ('OpenAI', 'Vercel', 'Supabase', 'Resend', 'Sentry', 'Upstash', 'Diğer')),
  amount_usd numeric(12, 2) NOT NULL DEFAULT 0 CHECK (amount_usd >= 0),
  amount_try numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount_try >= 0),
  invoice_number text CHECK (invoice_number IS NULL OR char_length(invoice_number) <= 120),
  is_kdv2_applicable boolean NOT NULL DEFAULT true,
  sent_to_accountant boolean NOT NULL DEFAULT false,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS founder_cloud_expenses_period_idx ON public.founder_cloud_expenses (period_month);

CREATE TABLE IF NOT EXISTS public.founder_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  overall_status text NOT NULL CHECK (overall_status IN ('ok', 'degraded', 'down')),
  daily_ai_spend_usd numeric(12, 4),
  services_json jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS founder_health_snapshots_checked_idx ON public.founder_health_snapshots (checked_at DESC);

CREATE TABLE IF NOT EXISTS public.founder_alert_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL CHECK (char_length(alert_key) BETWEEN 1 AND 200),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  message text NOT NULL CHECK (char_length(message) <= 2000),
  action_hint text CHECK (action_hint IS NULL OR char_length(action_hint) <= 1000),
  sent_to text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS founder_alert_logs_key_idx ON public.founder_alert_logs (alert_key, created_at DESC);
CREATE INDEX IF NOT EXISTS founder_alert_logs_created_idx ON public.founder_alert_logs (created_at DESC);

ALTER TABLE public.founder_cockpit_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founder_cloud_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founder_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founder_alert_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.founder_cockpit_settings FROM anon, authenticated;
REVOKE ALL ON public.founder_cloud_expenses FROM anon, authenticated;
REVOKE ALL ON public.founder_health_snapshots FROM anon, authenticated;
REVOKE ALL ON public.founder_alert_logs FROM anon, authenticated;

GRANT ALL ON public.founder_cockpit_settings TO service_role;
GRANT ALL ON public.founder_cloud_expenses TO service_role;
GRANT ALL ON public.founder_health_snapshots TO service_role;
GRANT ALL ON public.founder_alert_logs TO service_role;
