-- Güvenlik (6 Kasım 2026): soru bankası, havuz dersleri ve özellik bayrakları yalnız sunucudan okunur.
--
-- Bulgu: yayınlanan (publishable/anon) anahtarla, oturum açmadan 13.172 doğrulanmış sorunun TAMAMI cevap anahtarı,
-- açıklama ve iç denetim (`qa`) alanlarıyla okunabiliyordu; `topic_content` (ders içi soruların cevaplarıyla) ve
-- `feature_flags` (pilot kullanıcı kimlikleri, işletim kiraları) de öyle. Uygulama bu üç tabloyu yalnız servis
-- anahtarıyla okuyor (grep: tarayıcı istemcisinde hiç okunmuyor); anon/authenticated okuma izni hiçbir özelliğe
-- hizmet etmiyor, yalnız rakibe toplu kopyalama kapısı açıyordu.
--
-- RLS açık kalır; politika kalkınca anon ve authenticated hiçbir satır görmez, service_role (RLS'i atlar) aynen okur.
-- Geri alma: aşağıdaki üç CREATE POLICY satırını yeniden çalıştırmak.
--   CREATE POLICY item_bank_read_verified ON public.item_bank FOR SELECT TO anon, authenticated USING (status = 'verified');
--   CREATE POLICY topic_content_read_verified ON public.topic_content FOR SELECT TO anon, authenticated USING (status = 'verified');
--   CREATE POLICY feature_flags_read ON public.feature_flags FOR SELECT USING (true);

DROP POLICY IF EXISTS item_bank_read_verified ON public.item_bank;
DROP POLICY IF EXISTS topic_content_read_verified ON public.topic_content;
DROP POLICY IF EXISTS feature_flags_read ON public.feature_flags;

ALTER TABLE public.item_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
