-- Faz 5 §3.1 (19 Kasım 2026): "🚩 Soruda Hata Bildir" tanıtım turunda (/ornek) da question_reports'a yazar.
-- Yalnız eklemeli: yeni kaynak değeri 'demo' kabul edilir ve misafir bildirimi için user_id boş olabilir.
-- Var olan satırlara ve ödül/denetim akışına dokunulmaz; veri silinmez.
ALTER TABLE public.question_reports ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.question_reports DROP CONSTRAINT IF EXISTS question_reports_source_check;
ALTER TABLE public.question_reports
  ADD CONSTRAINT question_reports_source_check CHECK (source = ANY (ARRAY['node'::text, 'mock'::text, 'demo'::text]));

COMMENT ON COLUMN public.question_reports.user_id IS
  'Bildiren hesap. Tanıtım turundaki misafir bildiriminde (source = demo) boş.';
