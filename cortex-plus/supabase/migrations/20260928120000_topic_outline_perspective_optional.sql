-- Optional denormalized columns for one-shot outline teacher/student perspective.
-- The app packs the same data into existing columns (learning_objective,
-- prerequisites, key_definitions, key_relations) and works if these are absent.

ALTER TABLE public.document_topic_nodes
  ADD COLUMN IF NOT EXISTS exam_weight text;

ALTER TABLE public.document_topic_nodes
  ADD COLUMN IF NOT EXISTS likely_asked jsonb;

COMMENT ON COLUMN public.document_topic_nodes.exam_weight IS
  'Optional: high|medium|low from oneshot outline; app also packs into key_relations.';
COMMENT ON COLUMN public.document_topic_nodes.likely_asked IS
  'Optional: sinavda_sorulabilecekler array; app also packs into key_definitions.';
