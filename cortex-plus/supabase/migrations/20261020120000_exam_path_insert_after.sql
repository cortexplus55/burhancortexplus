-- 2 adım ileri, sonuca göre (20 Ekim 2026, ürün sahibinin kararı: kendiliğinden).
--
-- Puanlı bir adımda %50 altı alınınca konunun odaklı pratiği o adımdan hemen sonraya girer. Araya
-- düğüm koymak sonraki bütün düğümlerin sırasını bir kaydırmak demek; istemciden düğüm başına bir
-- güncelleme 90 düğümlük yolda tamamlama isteğini saniyelerce uzatıyordu. Kaydırma ve ekleme tek
-- işlemde, burada.
--
-- Yalnız ekleme: yeni fonksiyon. Tablo, veri ve mevcut fonksiyonlar değişmez.

CREATE OR REPLACE FUNCTION public.exam_path_insert_after(
  p_prep_id uuid,
  p_after_sort integer,
  p_kind text,
  p_title text,
  p_day_index integer,
  p_session_meta jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.exam_prep_nodes
     SET sort_order = sort_order + 1
   WHERE exam_prep_id = p_prep_id
     AND sort_order > p_after_sort;

  INSERT INTO public.exam_prep_nodes (exam_prep_id, kind, title, day_index, sort_order, status, session_meta)
  VALUES (p_prep_id, p_kind, p_title, GREATEST(1, p_day_index), p_after_sort + 1, 'locked', COALESCE(p_session_meta, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.exam_path_insert_after(uuid, integer, text, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exam_path_insert_after(uuid, integer, text, text, integer, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exam_path_insert_after(uuid, integer, text, text, integer, jsonb) TO service_role;
