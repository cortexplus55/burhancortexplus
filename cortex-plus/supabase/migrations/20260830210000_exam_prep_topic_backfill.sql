-- Copy study-plan tasks into exam_prep_topics for preps created before the topic path existed.
INSERT INTO public.exam_prep_topics (exam_prep_id, label, sort_order, status)
SELECT
  ep.id,
  spt.title,
  spt.sort_order,
  'ready'
FROM public.exam_preps ep
JOIN public.study_plan_tasks spt ON spt.plan_id = ep.study_plan_id
WHERE ep.study_plan_id IS NOT NULL
  AND spt.title IS NOT NULL
  AND btrim(spt.title) <> ''
  AND spt.title NOT LIKE 'Sınav notu:%'
  AND NOT EXISTS (
    SELECT 1
    FROM public.exam_prep_topics existing
    WHERE existing.exam_prep_id = ep.id
  );
