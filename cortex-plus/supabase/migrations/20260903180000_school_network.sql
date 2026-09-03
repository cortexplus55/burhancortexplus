-- ============================================================================
-- Faz 3 — Okul ağı
--
-- Okul bugüne kadar profiles.school_name'de serbest metindi: "İstanbul
-- Üniversitesi" ile "İstanbul Üniversitesi (İstanbul)" yazan iki öğrenci farklı
-- okullarda sayılıyordu. Ağ bunun üzerine kurulamaz, bu yüzden gerçek bir
-- referans (school_id) geliyor. school_name silinmiyor — hiçbir veri kaybolmasın.
--
-- Paylaşım varsayılan olarak kapalı; öğrenci açıkça paylaşana kadar hazırlık
-- gizli kalıyor.
--
-- Tamamen additive. Editör notu: satır sonunda çıplak THEN bırakmayın.
-- ============================================================================

-- --- 1) Profilde okul referansı --------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS profiles_school_idx ON public.profiles (school_id);

-- Adı birebir eşleşenleri bağla. Eşleşmeyenler boş kalır; o kullanıcılar okul
-- sekmesine girdiğinde bir kez seçim yapar.
UPDATE public.profiles p SET school_id = s.id FROM public.schools s WHERE p.school_id IS NULL AND p.school_name IS NOT NULL AND p.school_name = s.name;

-- --- 2) Hazırlıkta okul, görünürlük, sayaç ---------------------------------
ALTER TABLE public.exam_preps ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE public.exam_preps ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';
ALTER TABLE public.exam_preps ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.exam_preps ADD COLUMN IF NOT EXISTS forked_from uuid REFERENCES public.exam_preps(id) ON DELETE SET NULL;
ALTER TABLE public.exam_preps DROP CONSTRAINT IF EXISTS exam_preps_visibility_check;
ALTER TABLE public.exam_preps ADD CONSTRAINT exam_preps_visibility_check CHECK (visibility IN ('private','school'));
CREATE INDEX IF NOT EXISTS exam_preps_school_feed_idx ON public.exam_preps (school_id, view_count DESC) WHERE visibility = 'school';

-- --- 3) Okul akışı ----------------------------------------------------------
-- profiles RLS'i başkasının satırını okutmuyor; akış için yalnızca görünen ad
-- gerekiyor. Tüm profili açmak yerine sadece bu alanları döndüren bir fonksiyon.
-- Kullanıcının kendi okulu dışına asla çıkmaz.
CREATE OR REPLACE FUNCTION public.school_feed(p_limit integer DEFAULT 30) RETURNS TABLE (id uuid, title text, exam_type text, exam_date date, view_count integer, owner_name text, is_own boolean, topic_count bigint) AS $BODY$ SELECT e.id, e.title, e.exam_type, e.exam_date, e.view_count, COALESCE(NULLIF(split_part(COALESCE(pr.full_name, ''), ' ', 1), ''), 'Öğrenci') AS owner_name, e.user_id = auth.uid() AS is_own, (SELECT count(*) FROM public.exam_prep_topics t WHERE t.exam_prep_id = e.id) AS topic_count FROM public.exam_preps e JOIN public.profiles pr ON pr.id = e.user_id WHERE e.visibility = 'school' AND e.school_id IS NOT NULL AND e.school_id = (SELECT me.school_id FROM public.profiles me WHERE me.id = auth.uid()) ORDER BY e.view_count DESC, e.created_at DESC LIMIT LEAST(GREATEST(p_limit, 1), 100); $BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.school_feed(integer) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.school_feed(integer) TO authenticated;

-- Okul kartı: üye ve paylaşılan hazırlık sayısı.
CREATE OR REPLACE FUNCTION public.school_summary() RETURNS TABLE (school_id uuid, school_name text, member_count bigint, shared_count bigint) AS $BODY$ SELECT s.id, s.name, (SELECT count(*) FROM public.profiles p WHERE p.school_id = s.id), (SELECT count(*) FROM public.exam_preps e WHERE e.school_id = s.id AND e.visibility = 'school') FROM public.schools s WHERE s.id = (SELECT me.school_id FROM public.profiles me WHERE me.id = auth.uid()); $BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.school_summary() SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.school_summary() TO authenticated;

-- --- 4) Katılım sayacı ------------------------------------------------------
-- Sayaç yalnızca okulda paylaşılmış ve başkasına ait hazırlıklarda artar;
-- kendi hazırlığını açmak saymaz.
--
-- p_viewer neden var: bu fonksiyonu /api/school service role ile çağırıyor ve
-- orada auth.uid() NULL. COALESCE sırası önemli — oturumlu bir çağrıda gerçek
-- kimlik her zaman kazanır, parametre yok sayılır; yani kimse başkasının
-- kimliğini geçirerek sayaç oynatamaz.
CREATE OR REPLACE FUNCTION public.increment_prep_view(p_prep_id uuid, p_viewer uuid) RETURNS void AS $BODY$
DECLARE v_viewer uuid := COALESCE(auth.uid(), p_viewer);
BEGIN
UPDATE public.exam_preps SET view_count = view_count + 1 WHERE id = p_prep_id AND visibility = 'school' AND user_id <> v_viewer AND school_id = (SELECT me.school_id FROM public.profiles me WHERE me.id = v_viewer);
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.increment_prep_view(uuid, uuid) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.increment_prep_view(uuid, uuid) TO authenticated;

-- Not: fork sırasında konu başlıkları için ayrı bir SECURITY DEFINER fonksiyon
-- yok. /api/school kaynağın gerçekten aynı okulda paylaşıldığını zaten
-- doğruluyor ve service role RLS'i aşıyor; ikinci bir tanımlayıcı fonksiyon
-- eklemek yalnızca yüzey genişletirdi.
