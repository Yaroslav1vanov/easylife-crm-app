-- Аналитика ИИ-чата (19.10.2026): метрики задач от исполнителя + пульс сервера.
alter table public.client_chat_messages
  add column if not exists ai_started_at timestamptz,
  add column if not exists ai_finished_at timestamptz,
  add column if not exists ai_minutes numeric(8,2),
  add column if not exists ai_cost_usd numeric(10,4),
  add column if not exists ai_files int;

create table if not exists public.server_status (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  disk_used_gb  numeric(8,1),
  disk_total_gb numeric(8,1),
  load1         numeric(6,2),
  cpus          int,
  mem_used_mb   int,
  mem_total_mb  int,
  running       int
);
create index if not exists server_status_at_idx on public.server_status (at desc);
alter table public.server_status enable row level security;
grant all on public.server_status to service_role;
grant usage, select on sequence public.server_status_id_seq to service_role;

select 'ok' as result;
