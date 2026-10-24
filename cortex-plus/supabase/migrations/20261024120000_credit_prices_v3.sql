-- Kredi fiyatları v3 (24 Ekim 2026, ürün sahibinin kararı): 1 kredi ≈ $0,001 gerçek maliyet.
-- Ölçüm: docs/delivery/MALIYET-VERGI-24-EKIM.md ve tests/unit/_tmp/cost-bench (23 Ekim). Plus hakkı aynı
-- (aylık 7.200, haftalık 2.700). Sohbet mesajı 3 kalır: genel cevap tek çağrı (~$0,0002), belgeye dayanan cevap
-- luna denetimiyle (~$0,001-0,002; 24 Ekim 2026 canlı ölçüm). Yalnız fiyat satırları değişir: plan, cüzdan, defter dokunulmaz.
-- Bekleyen ayırmalar eski tutarla kapanır (credit_commit / credit_refund ayırmadaki tutarı okur).
-- Sıra (docs/delivery/KREDI-SISTEMI.md): sayaçlar (20261024121000_free_tier_counts) koddan ÖNCE; bu göç kod
-- yayına çıktıktan SONRA, 20261024123000_free_daily_zero ile TEK SQL çalıştırmasında ve iki schema_migrations
-- satırıyla. Koddan önce ya da tek başına uygulanırsa eski kod (credit_reserve'ü doğrudan çağırır) ücretsiz
-- hesabın ders ve testini açamaz. Geri alma: supabase/rollback/20261024_kredi_v3_geri_al.sql.
UPDATE public.credit_rules SET credit_cost = c.cost, updated_at = now()
  FROM (VALUES
    ('STUDY_PLAN_GENERATE', 30),
    ('QUIZ_GENERATE', 10),
    ('FLASHCARD_GENERATE', 4),
    ('DOCUMENT_PAGE_PROCESS', 5),
    ('IMAGE_SOLUTION', 4),
    ('ORAL_EXAM_GENERATE', 6)
  ) AS c(code, cost)
 WHERE credit_rules.action_code = c.code;
