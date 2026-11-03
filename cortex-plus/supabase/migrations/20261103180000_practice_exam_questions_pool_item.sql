-- Havuz denemesi (3 Kasım 2026): yazılı deneme sorusu doğrulanmış havuz sorusundan seçildiyse kaynağı.
-- Notlandırmada cevap item_responses + outcome_mastery'ye (Hakimiyet Haritası) yazılır. Yalnız ekleme.
alter table public.practice_exam_questions
  add column if not exists pool_item_id uuid references public.item_bank(id) on delete set null;

create index if not exists practice_exam_questions_pool_item_idx
  on public.practice_exam_questions (pool_item_id)
  where pool_item_id is not null;
