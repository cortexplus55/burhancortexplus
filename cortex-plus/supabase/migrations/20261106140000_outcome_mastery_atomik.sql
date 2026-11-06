-- Hakimiyet Haritası kanıtı tek çağrıda ve atomik (6 Kasım 2026, hız paketi).
--
-- Önce `recordAnswerEvidence` (src/lib/mastery-map/exam-evidence.ts) her kazanım için satırı okuyup
-- yeni α/β/n'yi kodda hesaplayıp geri yazıyordu (oku → değiştir → yaz). Aynı öğrencinin iki
-- notlaması aynı anda koşunca biri öbürünün artışını eziyordu. Bu fonksiyon aynı hesabı satır
-- kilidi altında yapar: INSERT … ON CONFLICT DO UPDATE, artış satırın o anki değerine eklenir.
--
-- Hesap koddakiyle birebir (PRIOR α = 1, β = 1, n = 0):
--   doğru  → α = round(α + w, 3), β aynı
--   yanlış → β = round(β + w, 3), α aynı
--   n = n + 1; unit_id, program_id ve updated_at son yazılanla değişir.
-- Elemanlar dizideki sırayla uygulanır (aynı kazanım iki kez geçerse iki kez artar).
--
-- p_rows: [{ "outcome_id": text, "unit_id": text, "program_id": text, "weight": number, "correct": boolean }, …]
-- Eksik alanlı ya da ağırlığı pozitif olmayan eleman atlanır. Dönüş: uygulanan eleman sayısı.
--
-- Yalnız sunucu anahtarı çalıştırır (Güvenlik paketi 1: tarayıcı rolleri yazamaz). Fonksiyon
-- çağıranın yetkisiyle çalışır (SECURITY INVOKER); service_role tabloya zaten yazabiliyor.
-- Yalnız ekleme: tablo, politika ve var olan fonksiyonlara dokunulmaz.

CREATE OR REPLACE FUNCTION public.add_outcome_evidence(p_user_id uuid, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  item jsonb;
  v_outcome text;
  v_unit text;
  v_program text;
  v_weight numeric;
  v_correct boolean;
  applied integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_outcome := NULLIF(item->>'outcome_id', '');
    v_unit := NULLIF(item->>'unit_id', '');
    v_program := NULLIF(item->>'program_id', '');
    v_weight := CASE WHEN jsonb_typeof(item->'weight') = 'number' THEN (item->>'weight')::numeric END;
    v_correct := CASE WHEN jsonb_typeof(item->'correct') = 'boolean' THEN (item->>'correct')::boolean END;
    IF v_outcome IS NULL OR v_unit IS NULL OR v_program IS NULL OR v_weight IS NULL OR v_weight <= 0 OR v_correct IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.outcome_mastery AS om (user_id, outcome_id, unit_id, program_id, alpha, beta, n, updated_at)
    VALUES (
      p_user_id,
      v_outcome,
      v_unit,
      v_program,
      CASE WHEN v_correct THEN round(1 + v_weight, 3) ELSE 1 END,
      CASE WHEN v_correct THEN 1 ELSE round(1 + v_weight, 3) END,
      1,
      now()
    )
    ON CONFLICT (user_id, outcome_id) DO UPDATE SET
      unit_id = EXCLUDED.unit_id,
      program_id = EXCLUDED.program_id,
      alpha = CASE WHEN v_correct THEN round(om.alpha + v_weight, 3) ELSE om.alpha END,
      beta = CASE WHEN v_correct THEN om.beta ELSE round(om.beta + v_weight, 3) END,
      n = om.n + 1,
      updated_at = now();

    applied := applied + 1;
  END LOOP;

  RETURN applied;
END;
$$;

REVOKE ALL ON FUNCTION public.add_outcome_evidence(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_outcome_evidence(uuid, jsonb) TO service_role;
