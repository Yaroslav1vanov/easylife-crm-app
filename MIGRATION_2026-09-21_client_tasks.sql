-- Задачи проджектов по клиентам. CRM создаёт их сама по датам клиента:
-- разговор на 15-й день после старта публикаций, недельный отчёт, напоминание об оплате,
-- контроль оплаты, анализ закрытого месяца. Крон /api/cron/client-tasks.
create table if not exists public.client_tasks (
  id           bigserial primary key,
  client_id    bigint not null references public.clients(id) on delete cascade,
  kind         text not null,               -- talk_day15 | weekly_report | payment_notice | payment_check | month_review
  title        text not null,
  description  text,
  due_date     date not null,
  month_number int,
  assignee_id  bigint references public.team_members(id) on delete set null,  -- проджект клиента на момент создания
  status       text not null default 'open' check (status in ('open', 'done', 'skipped')),
  result       text,
  done_at      timestamptz,
  done_by      bigint references public.team_members(id) on delete set null,
  source       text not null default 'auto',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (client_id, kind, due_date)
);
create index if not exists client_tasks_due_idx on public.client_tasks (due_date);
create index if not exists client_tasks_client_idx on public.client_tasks (client_id, status);

alter table public.client_tasks enable row level security;
drop policy if exists "client tasks read"  on public.client_tasks;
drop policy if exists "client tasks write" on public.client_tasks;
create policy "client tasks read"  on public.client_tasks for select using (true);
create policy "client tasks write" on public.client_tasks for all using (true) with check (true);
grant all on table public.client_tasks to anon, authenticated, service_role;
grant all on sequence public.client_tasks_id_seq to anon, authenticated, service_role;

drop trigger if exists trg_client_tasks_touch on public.client_tasks;
create trigger trg_client_tasks_touch before update on public.client_tasks
  for each row execute function public.touch_updated_at();
