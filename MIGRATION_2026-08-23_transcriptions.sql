-- Раздел «Транскрибация»: загрузил файл (или вставил ссылку) → получил текст.
-- Идемпотентно. Прогнать в Supabase SQL Editor.

create table if not exists public.transcriptions (
  id              bigserial primary key,
  client_id       bigint references public.clients(id) on delete set null,  -- необязательно
  script_id       bigint references public.scripts(id) on delete set null,  -- если текст нужен под конкретный сценарий
  title           text,
  source_type     text not null default 'file',   -- file | link
  source_url      text,                           -- R2-ссылка на файл или ссылка на чужой ролик
  file_name       text,
  platform        text,                           -- tiktok / instagram / youtube (для link)
  language        text,                           -- auto | ru | uk | en | …
  status          text not null default 'processing',  -- processing | done | error
  provider        text,                           -- assemblyai / scrapecreators
  provider_job_id text,
  text            text,
  duration_sec    numeric,
  error           text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_transcriptions_created on public.transcriptions (created_at desc);
create index if not exists idx_transcriptions_client  on public.transcriptions (client_id, created_at desc);

alter table public.transcriptions enable row level security;
drop policy if exists "tr all read"   on public.transcriptions;
drop policy if exists "tr all insert" on public.transcriptions;
drop policy if exists "tr all update" on public.transcriptions;
drop policy if exists "tr all delete" on public.transcriptions;
create policy "tr all read"   on public.transcriptions for select using (true);
create policy "tr all insert" on public.transcriptions for insert with check (true);
create policy "tr all update" on public.transcriptions for update using (true) with check (true);
create policy "tr all delete" on public.transcriptions for delete using (true);

grant all privileges on table public.transcriptions to anon, authenticated, service_role;
grant all privileges on sequence public.transcriptions_id_seq to anon, authenticated, service_role;
