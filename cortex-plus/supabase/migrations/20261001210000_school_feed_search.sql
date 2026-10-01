-- "Sınav hazırlıklarında ara" (1 Ekim 2026): okul akışının arama sürümü.
-- school_feed ile aynı sınır (yalnızca kendi okulu, yalnızca paylaşılan);
-- ek olarak oluşturma zamanı ("Yeni eklenenler") ve oluşturanı gruplamak için
-- kullanıcı kimliğinin özeti döner. Kimliğin kendisi dönmez.

CREATE OR REPLACE FUNCTION public.school_feed_search(p_limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid,
  title text,
  exam_type text,
  exam_date date,
  view_count integer,
  owner_name text,
  owner_key text,
  is_own boolean,
  topic_count bigint,
  created_at timestamptz
) AS $BODY$
  SELECT
    e.id,
    e.title,
    e.exam_type,
    e.exam_date,
    e.view_count,
    COALESCE(NULLIF(split_part(COALESCE(pr.full_name, ''), ' ', 1), ''), 'Öğrenci') AS owner_name,
    md5(e.user_id::text) AS owner_key,
    e.user_id = auth.uid() AS is_own,
    (SELECT count(*) FROM public.exam_prep_topics t WHERE t.exam_prep_id = e.id) AS topic_count,
    e.created_at
  FROM public.exam_preps e
  JOIN public.profiles pr ON pr.id = e.user_id
  WHERE e.visibility = 'school'
    AND e.school_id IS NOT NULL
    AND e.school_id = (SELECT me.school_id FROM public.profiles me WHERE me.id = auth.uid())
  ORDER BY e.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.school_feed_search(integer) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.school_feed_search(integer) FROM PUBLIC;
-- Supabase yeni fonksiyona anon için ayrıca izin veriyor; PUBLIC iptali onu kaldırmıyor.
REVOKE EXECUTE ON FUNCTION public.school_feed_search(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.school_feed_search(integer) TO authenticated;
