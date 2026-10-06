-- Короткие ИИ-задачи кнопок CRM (стоп-слова, адаптация, подписи, разбор рефа, отчёты) через Claude на нашем сервере
-- (подписка), а не через платный API-ключ. CRM кладёт задачу сюда и ждёт ответ, исполнитель на сервере забирает её.
-- Доступ только у служебного ключа: сотрудники в браузере эту таблицу не читают.
create table if not exists public.ai_jobs (
  id          bigserial primary key,
  kind        text not null,
  client_id   bigint references public.clients(id) on delete set null,
  model       text,
  system      text,
  prompt      text not null,
  max_tokens  integer,
  status      text not null default 'queued' check (status in ('queued', 'working', 'done', 'error')),
  result      text,
  error       text,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz
);
create index if not exists ai_jobs_queue_idx on public.ai_jobs (status, id) where status in ('queued', 'working');
alter table public.ai_jobs enable row level security;
grant all on table public.ai_jobs to service_role;
grant usage, select on sequence public.ai_jobs_id_seq to service_role;
select count(*) as "ai_jobs создана" from public.ai_jobs;
