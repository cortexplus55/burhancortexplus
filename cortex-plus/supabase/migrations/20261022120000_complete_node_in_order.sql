-- Düğüm tamamlama: sıradaki adım bitmiş düğümü atlar, sırası gelmeden bitirilen düğüm sonrakini açmaz
-- (22 Ekim 2026 inceleme).
--
-- 1) Erken çözülen yazılı deneme (her zaman açık) bitince düğümü 'done' oluyor; zorunlu yeniden planlama
--    kalan adımları denemenin ARKASINA numaralıyordu. Sonra sıradaki adım bitince "sonraki düğüm" bitmiş
--    deneme çıkıyor, `UPDATE … WHERE status = 'locked'` hiçbir satırı tutmuyor, yol sonsuza kadar kilitli
--    kalıyordu. Artık bu düğümden sonraki İLK KİLİTLİ düğüm açılır.
-- 2) Aynı erken deneme bir sonraki adımı ("Kartlarla son tekrar") sırası gelmeden açıyordu; yol kartı onu
--    tıklanabilir gösteriyordu. Önünde bitmemiş adım varken biten düğüm sonrakini açmaz — yol sırayla açılır
--    (18 Ekim 2026 kararı). Sırası gelen adım bitince kilitli ilk düğüm yine açılır.
-- 3) Dönen `nextId` de bitmiş düğümü atlar.
--
-- Yalnız fonksiyon gövdesi değişir; tablo ve yetkiler aynı. SQL ekranında uygulanır ve
-- `supabase_migrations.schema_migrations` satırı aynı oturumda yazılır.

CREATE OR REPLACE FUNCTION public.complete_exam_prep_node(
  p_user_id uuid, p_prep_id uuid, p_node_id uuid, p_attempt_id uuid,
  p_score integer, p_total integer, p_answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_node public.exam_prep_nodes%ROWTYPE;
  v_attempt public.exam_prep_node_attempts%ROWTYPE;
  v_next uuid;
  v_behind boolean;
BEGIN
  PERFORM 1 FROM public.exam_preps WHERE id = p_prep_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'prep_not_found'; END IF;
  SELECT * INTO v_node FROM public.exam_prep_nodes
    WHERE id = p_node_id AND exam_prep_id = p_prep_id FOR UPDATE;
  IF NOT FOUND OR v_node.status = 'locked' THEN RAISE EXCEPTION 'node_not_ready'; END IF;
  SELECT * INTO v_attempt FROM public.exam_prep_node_attempts
    WHERE id = p_attempt_id AND node_id = p_node_id
      AND exam_prep_id = p_prep_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active_attempt_required'; END IF;
  IF v_attempt.status = 'active' THEN
    IF p_score IS NULL OR p_total IS NULL OR p_total < 1 OR p_score < 0 OR p_score > p_total THEN
      RAISE EXCEPTION 'invalid_score';
    END IF;
    UPDATE public.exam_prep_node_attempts
      SET status = 'completed', score = p_score, total = p_total, answers = p_answers
      WHERE id = p_attempt_id;
    UPDATE public.exam_prep_nodes SET status = 'done' WHERE id = p_node_id;
    -- Önünde bitmemiş adım varsa (sırası gelmeden bitirilen her zaman açık deneme) sonraki açılmaz.
    SELECT EXISTS (
      SELECT 1 FROM public.exam_prep_nodes
      WHERE exam_prep_id = p_prep_id AND sort_order < v_node.sort_order AND status <> 'done'
    ) INTO v_behind;
    IF NOT v_behind THEN
      SELECT id INTO v_next FROM public.exam_prep_nodes
        WHERE exam_prep_id = p_prep_id AND sort_order > v_node.sort_order AND status = 'locked'
        ORDER BY sort_order, id LIMIT 1;
      UPDATE public.exam_prep_nodes SET status = 'ready' WHERE id = v_next AND status = 'locked';
    END IF;
    UPDATE public.exam_preps SET readiness_score = (
      SELECT round(100.0 * sum(CASE WHEN status = 'done' THEN weight ELSE 0 END) / nullif(sum(weight), 0))
      FROM (SELECT status, CASE kind
        WHEN 'written_exam' THEN 4 WHEN 'oral' THEN 3
        WHEN 'quiz' THEN 2 WHEN 'qa' THEN 2 WHEN 'true_false' THEN 2
        WHEN 'gaps' THEN 2 WHEN 'focused' THEN 2 WHEN 'final_check' THEN 2
        ELSE 1 END AS weight
        FROM public.exam_prep_nodes WHERE exam_prep_id = p_prep_id) weighted
    ) WHERE id = p_prep_id;
  END IF;
  SELECT id INTO v_next FROM public.exam_prep_nodes
    WHERE exam_prep_id = p_prep_id AND sort_order > v_node.sort_order AND status <> 'done'
    ORDER BY sort_order, id LIMIT 1;
  SELECT * INTO v_attempt FROM public.exam_prep_node_attempts WHERE id = p_attempt_id;
  RETURN jsonb_build_object('score', v_attempt.score, 'total', v_attempt.total, 'nextId', v_next);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_exam_prep_node(uuid, uuid, uuid, uuid, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_exam_prep_node(uuid, uuid, uuid, uuid, integer, integer, jsonb) TO service_role;
