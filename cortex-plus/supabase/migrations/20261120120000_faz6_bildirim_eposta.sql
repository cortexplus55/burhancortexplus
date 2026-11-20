-- UYGULANDI: 20 Kasım 2026, #710 yayınından sonra SQL ekranında, kayıt satırıyla (docs/operasyon/goc-kayitlari.md).
--
-- Faz 6 (20 Kasım 2026): bildirim merkezi ve yaşam döngüsü e-postaları için üç tablo. Ürün sahibinin kararı: yeni
-- tablolar kurulur, eski kayıtlar bunlara KOPYALANIR (eski tablolar silinmez, yalnız okunmaz olur):
--
--   notifications              → in_app_notifications      (bütün satırlar, kimlik aynı; okundu bilgisi korunur)
--   profiles.study_reminder_email = false → user_notification_preferences.study_reminders_email = false
--   email_events "once:" anahtarları     → email_dispatch_log (dedupe_key yeni biçimde)
--
-- Bilerek eski yerinde kalanlar:
--   * Kampanya izni (`email_preferences.marketing`): yasal onay kanıtı ve toplu gönderim SQL işlevleri ona bakar.
--   * Ödeme ve kod SQL işlevleri (`finalize_paytr_payment`, promosyon) `notifications`a yazmaya devam eder; ödeme yolu
--     değiştirilmez. Uygulama iki tabloyu kimlikle birleştirerek okur.
--
-- Yalnız ekleme: DROP, DELETE, UPDATE yok; var olan satıra dokunulmaz. İki kez çalıştırmak zararsız.
-- YAYIN SIRASI: önce kod (tablo yoksa eski tablolara düşer), sonra bu göç.

-- 1) Bildirim ve e-posta tercihleri (öğrenci başına tek satır; satır yoksa bütün anahtarlar açık, saat 19).
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  study_reminders_email boolean NOT NULL DEFAULT true,
  exam_countdown_email boolean NOT NULL DEFAULT true,
  weekly_digest_email boolean NOT NULL DEFAULT true,
  in_app_notifications boolean NOT NULL DEFAULT true,
  -- 18 = 18:30, 19 = 19:00, 20 = 20:00, 21 = 21:00 (Türkiye saati).
  preferred_study_hour smallint NOT NULL DEFAULT 19 CHECK (preferred_study_hour IN (18, 19, 20, 21)),
  -- Abonelikten çıkma bağlantısının anahtarı: 256 bit rastgele, tahmin edilemez, satırla birlikte doğar.
  unsubscribe_token text NOT NULL UNIQUE
    DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_notification_preferences FROM anon, authenticated;
GRANT ALL ON public.user_notification_preferences TO service_role;

-- 2) Uygulama içi bildirimler (çan). Yazım ve okuma yalnız sunucu anahtarıyla, sahiplik süzgeciyle.
CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  action_url text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Aynı olay iki kez bildirim açmasın (ör. aynı dönemde ikinci "%80" bildirimi); boşsa tekilleştirme yok.
  dedupe_key text
);

CREATE INDEX IF NOT EXISTS in_app_notifications_user_created_idx
  ON public.in_app_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS in_app_notifications_user_unread_idx
  ON public.in_app_notifications (user_id) WHERE NOT is_read;
CREATE UNIQUE INDEX IF NOT EXISTS in_app_notifications_user_dedupe_key
  ON public.in_app_notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.in_app_notifications FROM anon, authenticated;
GRANT ALL ON public.in_app_notifications TO service_role;

-- 3) E-posta gönderim kaydı: tekilleştirme (dedupe_key) ve yaşam döngüsü e-postalarının 24 saat kuralı.
CREATE TABLE IF NOT EXISTS public.email_dispatch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_key text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('transactional', 'lifecycle')),
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_dispatch_log_user_category_sent_idx
  ON public.email_dispatch_log (user_id, category, sent_at DESC);

ALTER TABLE public.email_dispatch_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_dispatch_log FROM anon, authenticated;
GRANT ALL ON public.email_dispatch_log TO service_role;

-- 4) Kopyalar (yalnız ekler; çakışan satır atlanır). Hesabı silinmiş (auth kaydı olmayan) satırlar kopyalanmaz.
INSERT INTO public.user_notification_preferences (user_id, study_reminders_email)
SELECT p.id, false
  FROM public.profiles p
 WHERE p.study_reminder_email = false
   AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.in_app_notifications (id, user_id, kind, title, body, is_read, created_at)
SELECT n.id, n.user_id, 'legacy', n.title, coalesce(n.body, ''), n.read_at IS NOT NULL, n.created_at
  FROM public.notifications n
 WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = n.user_id)
ON CONFLICT (id) DO NOTHING;

-- "once:" anahtarları yeni biçime: once:welcome → welcome:<kullanıcı>, once:trial → trial:<kullanıcı>,
-- once:referral_invite → referral_invite:<kullanıcı>, once:purchase:<sipariş> → purchase:<sipariş>, hediye anahtarları
-- (once:referral_gift…) → <anahtar>:<kullanıcı>. Yalnız gönderilmiş (status = 'sent') satırlar.
INSERT INTO public.email_dispatch_log (user_id, template_key, dedupe_key, category, sent_at)
SELECT e.user_id,
       split_part(substr(e.template_key, 6), ':', 1),
       CASE
         WHEN e.template_key LIKE 'once:purchase:%' THEN substr(e.template_key, 6)
         ELSE substr(e.template_key, 6) || ':' || e.user_id::text
       END,
       'transactional',
       e.created_at
  FROM public.email_events e
 WHERE e.template_key LIKE 'once:%'
   AND e.status = 'sent'
   AND e.user_id IS NOT NULL
ON CONFLICT (dedupe_key) DO NOTHING;
