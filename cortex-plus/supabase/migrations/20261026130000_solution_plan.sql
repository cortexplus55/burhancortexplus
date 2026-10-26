-- Adım adım kısmi puan. Sütun yoksa not, örnek cevap eşitliğinden okunur.
-- Yeni tabloda politika satırı yok. DROP POLICY yok.

alter table public.practice_exam_questions
  add column if not exists solution_plan jsonb;

comment on column public.practice_exam_questions.solution_plan is
  'Sıralı adımlar: formül, beklenen ara değer, ağırlık. Öğrenci metninde görünmez.';
