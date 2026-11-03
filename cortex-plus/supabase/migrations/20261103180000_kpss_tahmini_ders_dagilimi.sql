-- Additive: KPSS GY/GK içindeki ders soru sayıları ÖSYM 2026 KPSS Lisans Kılavuzu'nda YOK (Tablo: GY 60 + GK 60 = 120, 130 dk, PDF s.19 / basılı s.16).
-- Net kartı için tahmini dağılım satırları; is_estimate = true ile resmî satırlardan ayrılır. Mevcut satırlara dokunulmaz.
alter table public.curriculum_exam_structures add column if not exists is_estimate boolean not null default false;

insert into public.curriculum_exam_structures (id, exam, section, subject, question_count, weight, minutes, sort_order, source_id, source_url, program_version, sha256, fetched_at, is_estimate)
select v.id, 'KPSS-TAHMINI', 'Genel Yetenek-Genel Kültür (tahmini ders dağılımı; ÖSYM yayımlamaz)', v.subject, v.n, null, 130, v.ord,
       k.source_id, k.source_url, k.program_version, k.sha256, k.fetched_at, true
from (values
  ('KPSS-TAHMINI#70', 'Türkçe', 30, 70),
  ('KPSS-TAHMINI#71', 'Matematik', 30, 71),
  ('KPSS-TAHMINI#72', 'Tarih', 27, 72),
  ('KPSS-TAHMINI#73', 'Coğrafya', 18, 73),
  ('KPSS-TAHMINI#74', 'Vatandaşlık', 9, 74),
  ('KPSS-TAHMINI#75', 'Güncel Bilgiler', 6, 75)
) as v(id, subject, n, ord)
cross join (select * from public.curriculum_exam_structures where id = 'KPSS#31') k
on conflict (id) do nothing;
