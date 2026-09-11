-- Çalışma hatırlatması e-postası için açık/kapalı tercihi.
--
-- Uygulama içi bildirim yalnızca zaten giren öğrenciye ulaşıyor; girmeyeni
-- geri getiren tek şey e-posta. Ama kapatılamayan e-posta gönderilmez, o
-- yüzden gönderim bu kolon gelene kadar kapalı tutuldu.
--
-- Varsayılan TRUE: öğrenci hatırlatmayı isteyerek kurmuş sayılır (hazırlığı
-- kendisi oluşturdu). Kapatma ayarlar ekranında tek tıkla yapılıyor.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS study_reminder_email boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.study_reminder_email IS
  'Günlük çalışma hatırlatması e-postası gönderilsin mi. Kapatan öğrenciye yalnızca uygulama içi bildirim düşer.';
