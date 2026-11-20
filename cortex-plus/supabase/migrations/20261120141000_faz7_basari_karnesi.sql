-- UYGULANDI: 20 Kasım 2026, #712 yayınından sonra SQL ekranında, kayıt satırıyla (docs/operasyon/goc-kayitlari.md). Ürün sahibi SQL ekranında uygular ve aynı oturumda kayıt satırını yazar:
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261120141000', 'faz7_basari_karnesi') on conflict (version) do nothing;
--
-- Sınav sonrası başarı toplayıcı: sınav günü geçince hazırlık sayfası "🎓 Sınavın Nasıl Geçti?" diye sorar; öğrencinin
-- gerçek notu, yorumu, isteğe bağlı görünen adı ve AÇIK İZNİ (varsayılan kapalı) burada durur. Hazırlık başına tek
-- satır (yeniden gönderimde güncellenir). Herkese açık bir gösterim yüzeyi henüz yok; izin yalnız kayıtta.
--
-- Erişim: satır güvenliği açık, politika yok; tarayıcı rolleri hiçbir şey okuyamaz ve yazamaz (REVOKE). Yazma ve okuma
-- yalnız sunucu anahtarıyla, sahiplik süzgeciyle (`/api/learning/exam-prep/exam-feedback`). Hesap silinince
-- `purgeUserData` siler; hazırlık ya da kullanıcı silinince CASCADE.
--
-- Yalnız ekleme: CREATE ... IF NOT EXISTS; DROP, DELETE, UPDATE yok. İki kez çalıştırmak zararsız.
-- YAYIN SIRASI: kod göçsüz de çalışır (tablo yoksa not `learning_preferences.examResult`a yazılır, yorum kaydedilmez ve
-- öğrenciye söylenir). Göç kod yayınından önce ya da sonra uygulanabilir.

CREATE TABLE IF NOT EXISTS public.exam_feedback_testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  exam_prep_id uuid NOT NULL UNIQUE REFERENCES public.exam_preps (id) ON DELETE CASCADE,
  -- Gönderim anında hazırlık sayfasının "Hazırlık" puanı (sunucuda imzalı anlık görüntüden; okunamazsa boş).
  predicted_readiness_pct numeric,
  -- Öğrencinin yazdığı not: "85", "AA", "72/100" … serbest metin.
  actual_score text NOT NULL,
  comment text NOT NULL,
  -- Herkese açık gösterim yalnız bu izinle; varsayılan kapalı.
  allow_public_showcase boolean DEFAULT false,
  display_name text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_feedback_testimonials_user_idx
  ON public.exam_feedback_testimonials (user_id);

ALTER TABLE public.exam_feedback_testimonials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exam_feedback_testimonials FROM anon, authenticated;
GRANT ALL ON public.exam_feedback_testimonials TO service_role;
