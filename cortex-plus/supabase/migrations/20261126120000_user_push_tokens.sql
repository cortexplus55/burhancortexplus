-- UYGULANDI: 26 Kasım 2026, #728 yayınından sonra, Burhan'ın onayıyla (Supabase SQL ekranı + kayıt satırı;
-- docs/operasyon/goc-kayitlari.md). Kayıt satırı:
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261126120000', 'user_push_tokens') on conflict (version) do nothing;
--
-- Mobil uygulama, Aşama 1: anlık bildirim cihaz anahtarları. Uygulama (iOS ya da Android) bildirim izni verilince
-- cihazın anahtarını `/api/push/token` ucuna yazar; sunucu `src/lib/notifications/push.ts` ile gönderir (Türkiye saatiyle
-- 22:00–08:00 sessiz saat ve öğrencinin bildirim tercihi geçerli). Bir cihaz anahtarı tek hesaba bağlıdır: aynı telefonda
-- başka hesapla girilince satır yeni hesaba geçer (benzersiz `token`). Çıkış yapılınca uygulama anahtarı siler.
--
-- Erişim: satır güvenliği açık, politika yok; tarayıcı rolleri hiçbir şey okuyamaz ve yazamaz (REVOKE). Yazma ve okuma
-- yalnız sunucu anahtarıyla, `user_id` süzgeciyle. Hesap silinince `purgeUserData` siler; profil silinince CASCADE.
--
-- Yalnız ekleme: bir yeni tablo ve dizini. Var olan hiçbir tablo, sütun, kısıt ya da satır değişmez; DROP, ALTER (var olan
-- tabloda), DELETE, UPDATE yok. İki kez çalıştırmak zararsız (IF NOT EXISTS).
-- YAYIN SIRASI: kod göçsüz de çalışır: tablo yoksa anahtar yazımı "kaydedilmedi" döner, gönderim sessizce atlanır.
-- Göç kod yayınından sonra uygulanır.

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  token text NOT NULL CHECK (char_length(token) BETWEEN 16 AND 4096),
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_push_tokens_token_key UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS user_push_tokens_user_idx ON public.user_push_tokens (user_id);

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_push_tokens FROM anon, authenticated;
GRANT ALL ON public.user_push_tokens TO service_role;
