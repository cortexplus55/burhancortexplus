-- Düello 9B (15 Kasım 2026, Burhan onayı: "20 kredi + günlük sınır"): yeni düello kurmak kendi eylem koduyla, 20 kredi.
-- Bugünkü düello QUIZ_GENERATE (10 kredi) ile ücretleniyordu.
-- UYGULANDI: 15 Kasım 2026 10:44 UTC, Burhan onayı "DÜELLO GÖÇÜNÜ UYGULA" (docs/operasyon/goc-kayitlari.md). Yalnız ekleme; var olan satıra ve veriye dokunmaz.
-- Kod göçten önce yayına çıkarsa `reserveCredits` eksik kuralı fiyat tablosundan tohumlar (Paket H); göç gelince açıklama
-- bu metinle güncellenir. Ücretsiz hesapta Plus'a özel değil: hediye bakiyesi yetiyorsa bakiyeden (DUEL_ACCESS).
--   insert into supabase_migrations.schema_migrations (version, name)
--     values ('20261115140000', 'duel_generate_credits') on conflict (version) do nothing;

INSERT INTO public.credit_rules (action_code, credit_cost, model_tier, description, active)
VALUES ('DUEL_GENERATE', 20, 'standard', 'Düello kurma (7-10 soru, kolaydan zora)', true)
ON CONFLICT (action_code) DO UPDATE
  SET credit_cost = EXCLUDED.credit_cost,
      description = EXCLUDED.description,
      active = true,
      updated_at = now();
