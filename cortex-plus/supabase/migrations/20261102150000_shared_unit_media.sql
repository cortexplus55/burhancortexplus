-- Hazır (havuz) ünitelerin video/podcast içeriği için paylaşımlı önbellek (2 Kasım 2026).
-- Belgesiz hazırlıkta aynı ünite (program_id + unit_id + unit_sha256) ve aynı tür için ilk üretim herkes için yazılır;
-- sonraki öğrenciler model çağrısı olmadan kopyasını alır. Maliyet ai_usage_events'te SHARED_CONTENT_* koduyla.
-- Yalnız ekleme: yeni tablo, mevcut tablolara dokunulmaz. Yalnız servis rolü okur/yazar.
create table if not exists public.shared_unit_media (
  id uuid primary key default gen_random_uuid(),
  program_id text not null,
  unit_id text not null,
  unit_sha256 text not null,
  kind text not null,
  payload jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (program_id, unit_id, unit_sha256, kind)
);
alter table public.shared_unit_media enable row level security;
revoke all on public.shared_unit_media from anon, authenticated;
