-- Paket J2 #10 (31 Ekim 2026): "🚩 Soruda hata bildir".
--
-- Öğrenci konu testinde ya da yazılı denemede bir soruyu bildirir; soru hızlı bir model denetiminden geçer.
-- Gerçekten hatalıysa (anahtar yanlış, iki doğru ya da hiç doğru yok, çözülemeyen kök, anlamı bozan yazım)
-- soru düzeltilir ya da geçersiz sayılıp tam puan verilir; öğrenci hediye kredi ve yıldız alır. Ödül günde
-- en çok 3 bildirim için (kötüye kullanım koruması), aynı soru aynı öğrenciden bir kez.
--
-- Yalnız ekleme. Satır güvenliği açık, politika yok: okuma ve yazma yalnız service_role (API ucu).

CREATE TABLE IF NOT EXISTS public.question_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'node': yoldaki etkinlik (exam_prep_node_attempts.id), 'mock': yazılı deneme (practice_exams.id)
  source text NOT NULL CHECK (source IN ('node', 'mock')),
  target_id uuid NOT NULL,
  -- Düğümde soru sırası, denemede practice_exam_questions.id
  question_ref text NOT NULL,
  prep_id uuid,
  reason text NOT NULL,
  note text,
  question_snapshot jsonb NOT NULL,
  verdict text NOT NULL DEFAULT 'pending' CHECK (verdict IN ('pending', 'valid', 'invalid', 'error')),
  issue_kind text,
  explanation text,
  corrected jsonb,
  rewarded boolean NOT NULL DEFAULT false,
  reward_day text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (user_id, source, target_id, question_ref)
);

CREATE INDEX IF NOT EXISTS question_reports_rewarded_day
  ON public.question_reports (user_id, reward_day) WHERE rewarded;
CREATE INDEX IF NOT EXISTS question_reports_created
  ON public.question_reports (created_at DESC);

ALTER TABLE public.question_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_reports FROM anon, authenticated;
GRANT ALL ON public.question_reports TO service_role;

-- Ödülü günlük tavanla, yarışsız ayırır: aynı öğrencinin iki bildirimi aynı anda gelse de tavan aşılmaz.
CREATE OR REPLACE FUNCTION public.claim_question_report_reward(p_report uuid, p_day text, p_cap integer)
RETURNS boolean AS $BODY$
DECLARE
  v_user uuid;
  v_count integer;
BEGIN
  SELECT user_id INTO v_user FROM public.question_reports
    WHERE id = p_report AND verdict = 'valid' AND NOT rewarded;
  IF v_user IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('question_report_reward:' || v_user::text));
  SELECT count(*) INTO v_count FROM public.question_reports
    WHERE user_id = v_user AND rewarded AND reward_day = p_day;
  IF v_count >= p_cap THEN RETURN false; END IF;
  UPDATE public.question_reports SET rewarded = true, reward_day = p_day
    WHERE id = p_report AND NOT rewarded;
  RETURN FOUND;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.claim_question_report_reward(uuid, text, integer) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.claim_question_report_reward(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_question_report_reward(uuid, text, integer) TO service_role;
