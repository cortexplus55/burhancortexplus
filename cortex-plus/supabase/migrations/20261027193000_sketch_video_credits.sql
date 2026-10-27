-- Çizimli video (27 Ekim 2026): sahne resmi yok, 25 kredi.
-- Resimli video VIDEO_GENERATE 280 kalır.

INSERT INTO public.credit_rules (action_code, credit_cost, model_tier, description, active)
VALUES ('SKETCH_VIDEO_GENERATE', 25, 'standard', '1 dakikalık çizimli video (şema ve ses; sahne resmi yok)', true)
ON CONFLICT (action_code) DO UPDATE
  SET credit_cost = EXCLUDED.credit_cost,
      description = EXCLUDED.description,
      active = true,
      updated_at = now();

CREATE OR REPLACE FUNCTION public.plus_only_action(p_code text)
RETURNS boolean AS $BODY$
  SELECT p_code IN (
    'PODCAST_GENERATE',
    'ORAL_EXAM_GENERATE',
    'PRACTICE_EXAM_GENERATE',
    'VIDEO_GENERATE',
    'SKETCH_VIDEO_GENERATE',
    'VOICE_TURN',
    'AUDIO_SYNTHESIZE'
  );
$BODY$ LANGUAGE sql IMMUTABLE;
