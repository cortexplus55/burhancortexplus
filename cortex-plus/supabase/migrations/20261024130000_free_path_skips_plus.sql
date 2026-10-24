-- Ücretsiz hesabın yolu Plus'a özel adımda kilitlenmez (24 Ekim 2026, lansman öncesi canlı test).
--
-- Kredi v3'ten beri podcast, sözlü ve yazılı deneme ücretsiz hesapta açılmıyor (plus_only_action). Plan kurucusu
-- bu türleri yine yola koyuyor (şablon: ilk dersin hemen arkasına podcast ve sözlü; sınav gününe yazılı deneme).
-- 20261022120000'deki kural "önünde bitmemiş adım varken biten düğüm sonrakini açmaz" diyor: ücretsiz öğrenci
-- Plus'a özel adımı hiç bitiremeyeceği için yolu o adımdan sonra sonsuza kadar kilitli kalıyordu (14 günlük beta
-- Plus kodu bitince de aynısı). Şimdi ücretsiz hesapta (Plus abonesi değil; önizlemesi kapalı yönetici değil):
--   1) Plus'a özel bitmemiş adım "önünde bitmemiş adım" sayılmaz;
--   2) açılan düğüm Plus'a özelse arkasındaki ilk kilitli düğüm de açılır (Plus adımı yolda rozetle görünür);
--   3) dönen nextId Plus'a özel adımı atlar.
-- Abone ve kurucu için davranış 20261022120000 ile aynı. Yalnız fonksiyon gövdesi değişir; tablo ve yetkiler aynı.
-- Kayıt satırı aynı çalıştırmada:
--   insert into supabase_migrations.schema_migrations (version, name) values ('20261024130000', 'free_path_skips_plus')
--     on conflict (version) do nothing;

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
  v_next_kind text;
  v_behind boolean;
  v_admin boolean;
  v_preview boolean;
  v_free boolean;
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

  -- Ücretsiz hesap, credit_reserve_metered ile aynı karar: önizlemedeki yönetici (aboneliği olsa da) ücretsiz;
  -- yoksa etkin Plus/Sigma aboneliği ya da yönetici değilse ücretsiz.
  v_admin := public.is_admin(p_user_id);
  v_preview := v_admin AND EXISTS (SELECT 1 FROM public.admin_free_preview WHERE user_id = p_user_id);
  v_free := v_preview OR NOT (
    v_admin
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
        JOIN public.plans pl ON pl.id = s.plan_id
       WHERE s.user_id = p_user_id
         AND s.status = 'active'
         AND pl.is_premium
         AND (s.current_period_end IS NULL OR s.current_period_end > now())
    )
  );

  IF v_attempt.status = 'active' THEN
    IF p_score IS NULL OR p_total IS NULL OR p_total < 1 OR p_score < 0 OR p_score > p_total THEN
      RAISE EXCEPTION 'invalid_score';
    END IF;
    UPDATE public.exam_prep_node_attempts
      SET status = 'completed', score = p_score, total = p_total, answers = p_answers
      WHERE id = p_attempt_id;
    UPDATE public.exam_prep_nodes SET status = 'done' WHERE id = p_node_id;
    -- Önünde bitmemiş adım varsa (sırası gelmeden bitirilen her zaman açık deneme) sonraki açılmaz.
    -- Ücretsiz hesapta Plus'a özel adım bu sayıma girmez: hiç bitirilemez.
    SELECT EXISTS (
      SELECT 1 FROM public.exam_prep_nodes
      WHERE exam_prep_id = p_prep_id AND sort_order < v_node.sort_order AND status <> 'done'
        AND NOT (v_free AND kind IN ('podcast', 'oral', 'written_exam'))
    ) INTO v_behind;
    IF NOT v_behind THEN
      LOOP
        SELECT id, kind INTO v_next, v_next_kind FROM public.exam_prep_nodes
          WHERE exam_prep_id = p_prep_id AND sort_order > v_node.sort_order AND status = 'locked'
          ORDER BY sort_order, id LIMIT 1;
        EXIT WHEN v_next IS NULL;
        UPDATE public.exam_prep_nodes SET status = 'ready' WHERE id = v_next AND status = 'locked';
        -- Ücretsiz hesapta açılan Plus adımı yolu tutmaz: arkasındaki ilk adım da açılır.
        EXIT WHEN NOT (v_free AND v_next_kind IN ('podcast', 'oral', 'written_exam'));
      END LOOP;
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
      AND NOT (v_free AND kind IN ('podcast', 'oral', 'written_exam'))
    ORDER BY sort_order, id LIMIT 1;
  SELECT * INTO v_attempt FROM public.exam_prep_node_attempts WHERE id = p_attempt_id;
  RETURN jsonb_build_object('score', v_attempt.score, 'total', v_attempt.total, 'nextId', v_next);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_exam_prep_node(uuid, uuid, uuid, uuid, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_exam_prep_node(uuid, uuid, uuid, uuid, integer, integer, jsonb) TO service_role;
