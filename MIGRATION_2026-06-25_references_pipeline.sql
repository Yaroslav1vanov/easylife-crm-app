-- Референс-пайплайн: стадии + разбор донора + связь со сценарием. Идемпотентно.
alter table public.reference_videos
  add column if not exists status text default 'new',          -- new / selected / review / approved
  add column if not exists analysis text,                       -- РАЗБОР ДОНОРА (AI)
  add column if not exists analyzed_at timestamptz,
  add column if not exists script_id bigint references public.scripts(id) on delete set null;
