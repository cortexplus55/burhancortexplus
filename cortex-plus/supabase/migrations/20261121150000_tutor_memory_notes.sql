-- UYGULANDI: 21 Kasım 2026, #722 yayınından sonra (Supabase SQL ekranı + kayıt satırı; docs/operasyon/goc-kayitlari.md).
-- Kayıt satırı (SQL ekranında aynı oturumda):
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261121150000', 'tutor_memory_notes') on conflict (version) do nothing;
--
-- Faz 11 (teacher.v2, ürün sahibinin kararı): öğretmen notları. Oturum bitince (bir önceki öğretmen mesajından 30 dakika
-- sonra) ya da her 8. öğretmen mesajında tek küçük model çağrısı en çok üç kısa öğrenme gözlemi yazar ("… kuralında
-- takılıyor", "kısa adımları tercih ediyor"). Öğretmen bağlamı son beş notu okur. Kişisel ya da hassas bilgi yazılmaz.
--
-- Erişim: satır güvenliği açık, politika yok; tarayıcı rolleri hiçbir şey okuyamaz ve yazamaz (REVOKE). Yazma ve okuma
-- yalnız sunucu anahtarıyla, `user_id` süzgeciyle. Hesap silinince `purgeUserData` siler; kullanıcı ya da konuşma
-- silinince CASCADE.
--
-- İkinci tablo: `tutor_conversation_preps`. Ana sohbet bir hazırlığın bağlamında yürüdüğünde (istekte `contextPrepId`,
-- sunucu sahipliği doğrular) konuşma o hazırlığa bağlanır; "Sohbet geçmişi" konuşmaları hazırlığa göre gruplar.
-- Konuşma başına tek satır (son bağlam geçerli). Hazırlık silinince bağ satırı gider, konuşma "Genel" grupta kalır.
--
-- Yalnız ekleme: iki yeni tablo ve dizinleri. Var olan hiçbir tablo, sütun, kısıt ya da satır değişmez; DROP, ALTER (var olan
-- tabloda), DELETE, UPDATE yok. İki kez çalıştırmak zararsız (IF NOT EXISTS).
-- "Bunu Yanlışlar Defterime ekle" bu göce bağlı DEĞİLDİR: sohbetten düşen soru defterin var olan kaynak değeriyle yazılır,
-- öğretmen sohbetinden geldiği `source_ref` önekinden (`chat:<mesaj>`) anlaşılır (mistake-notebook.ts). Yanlış defterinin
-- kaynak kısıtına dokunulmaz.
-- YAYIN SIRASI: kod göçsüz de çalışır ve yalnız teacher.v2 açıkken bu tabloya dokunur: tablo yoksa not yazımı ve okuması
-- sessizce atlanır. Göç kod yayınından sonra uygulanır.

CREATE TABLE IF NOT EXISTS public.tutor_memory_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations (id) ON DELETE CASCADE,
  note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 160),
  kind text NOT NULL DEFAULT 'stuck' CHECK (kind IN ('stuck', 'preference', 'strength')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tutor_memory_notes_user_created_idx
  ON public.tutor_memory_notes (user_id, created_at DESC);

ALTER TABLE public.tutor_memory_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tutor_memory_notes FROM anon, authenticated;
GRANT ALL ON public.tutor_memory_notes TO service_role;

COMMENT ON TABLE public.tutor_memory_notes IS
  'Faz 11: öğretmenin oturum sonu kısa öğrenme gözlemleri (en çok 3 / oturum, ≤160 karakter). Yalnız sunucu anahtarı.';

CREATE TABLE IF NOT EXISTS public.tutor_conversation_preps (
  conversation_id uuid PRIMARY KEY REFERENCES public.conversations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  prep_id uuid NOT NULL REFERENCES public.exam_preps (id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tutor_conversation_preps_user_prep_idx
  ON public.tutor_conversation_preps (user_id, prep_id);

ALTER TABLE public.tutor_conversation_preps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tutor_conversation_preps FROM anon, authenticated;
GRANT ALL ON public.tutor_conversation_preps TO service_role;

COMMENT ON TABLE public.tutor_conversation_preps IS
  'Faz 11: ana sohbetin bağlandığı hazırlık (sohbet geçmişini hazırlığa göre gruplamak için). Yalnız sunucu anahtarı.';
