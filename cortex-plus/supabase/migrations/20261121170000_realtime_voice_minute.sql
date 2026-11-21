-- UYGULANDI: 21 Kasım 2026, #724 birleştirilmeden ve yayından önce (Burhan'ın kararı; SQL ekranı + kayıt satırı;
-- docs/operasyon/goc-kayitlari.md). Kayıt satırı (aynı çalıştırmada):
--   insert into supabase_migrations.schema_migrations (version, name) values ('20261121170000', 'realtime_voice_minute')
--     on conflict (version) do nothing;
--
-- Canlı sesli öğretmen ("Konuş", teacher.v2 bayrağının arkasında). Burhan'ın kararı: model gpt-realtime-2.1-mini,
-- dakikası 60 kredi (önce 40; ölçülen dakika ortalama 0,044 $, 21 Kasım 2026). Yalnız EKLER: var olan kredi kuralına, fiyat satırına ve hiçbir SQL işlevine dokunmaz. İki kez
-- çalışınca aynı sonuç (ON CONFLICT DO NOTHING). Göçten önce de kod çalışır: ilk ayırmada kod satırı fiyat tablosundan
-- ekler (Paket H yedeği, `/admin/sistem` "göç yazılmalı" uyarısı gösterir); bu göç açıklamayı kendi metniyle yazmaz,
-- çünkü satır varsa dokunulmaz — öyle bir durumda açıklamayı /admin/kredi-kurallari'ndan düzeltmek yeter.
--
-- Ücret kuralı (kod: src/lib/tutor/realtime/billing.ts): her dakikanın kredisi dakika başında ayrılır; dakikanın ilk
-- 5 saniyesi geçtiyse dakika ödenir (başlayan dakika ödenir), geçmeden biterse ayrılan kredi iade edilir. Ücretsiz
-- hesapta kredi düşmez: hesap başına bir kez 1 dakikalık deneme (kanıt ai_usage_events'te REALTIME_VOICE_TRIAL satırı),
-- sonrası Plus. Plus'a özel iş listesine (plus_only_action) bilerek EKLENMEDİ: o işlev değişmesin diye kapı kodda.
--
-- Fiyat satırları (OpenAI, gpt-realtime-2.1-mini, 21 Kasım 2026'da model sayfasından doğrulandı; 1M jeton başına):
--   metin girdi $0,60 · önbellekli metin $0,06 · metin çıktı $2,40 · ses girdi $10 · önbellekli ses $0,30 ·
--   ses çıktı $20 · görsel girdi $0,80 · önbellekli görsel $0,08.
--   Kaynak: https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini
-- ai_model_prices her model adı için tek girdi/çıktı fiyatı tutar; ses, metin ve görsel ayrı fiyatlandığı için oturumun
-- kullanımı ayrı model adlarıyla yazılır (`realtimeUsageRows`): "<model>" metin, "<model>-audio" ses, "<model>-image"
-- görsel, "-cached-*" önbellekli girdi. Birim bin jeton (sütun adı "per_1k").

INSERT INTO public.credit_rules (action_code, credit_cost, model_tier, description, active)
VALUES ('REALTIME_VOICE_MINUTE', 60, 'standard', 'Canlı sesli öğretmen: dakika başına 60 kredi (başlayan dakika ödenir)', true)
ON CONFLICT (action_code) DO NOTHING;

INSERT INTO public.ai_model_prices (model, input_per_1k, output_per_1k)
VALUES
  ('gpt-realtime-2.1-mini', 0.000600, 0.002400),
  ('gpt-realtime-2.1-mini-audio', 0.010000, 0.020000),
  ('gpt-realtime-2.1-mini-image', 0.000800, 0.000000),
  ('gpt-realtime-2.1-mini-cached-text', 0.000060, 0.000000),
  ('gpt-realtime-2.1-mini-cached-audio', 0.000300, 0.000000),
  ('gpt-realtime-2.1-mini-cached-image', 0.000080, 0.000000)
ON CONFLICT (model) DO NOTHING;

-- Doğrulama:
--   select action_code, credit_cost, active from public.credit_rules where action_code = 'REALTIME_VOICE_MINUTE';
--   select model, input_per_1k, output_per_1k from public.ai_model_prices where model like 'gpt-realtime-2.1-mini%' order by 1;
