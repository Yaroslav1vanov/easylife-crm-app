-- «План / факт» в карточке клиента (Статистика → План / факт).
-- План — на контрактный месяц (M1, M2… из client_months): ролики, просмотры, подписчики, кодовые слова, заявки, консультации, продажи.
-- Факт: ролики, просмотры и подписчики — автоматически (CRM + аналитика), остальное тимлид вносит раз в неделю.
create table if not exists public.client_plans (
  id           bigserial primary key,
  client_id    bigint not null references public.clients(id) on delete cascade,
  month_number integer not null,
  metrics      jsonb not null default '{}'::jsonb,
  source       text not null default 'manual' check (source in ('manual','forecast')),
  updated_by   text,
  updated_at   timestamptz not null default now(),
  unique (client_id, month_number)
);
create table if not exists public.client_fact_weeks (
  id          bigserial primary key,
  client_id   bigint not null references public.clients(id) on delete cascade,
  week_start  date not null,
  codewords   integer, leads integer, calls integer, sales integer,
  note        text,
  entered_by  text,
  updated_at  timestamptz not null default now(),
  unique (client_id, week_start)
);
alter table public.client_plans enable row level security;
alter table public.client_fact_weeks enable row level security;
drop policy if exists crm_authenticated on public.client_plans;
create policy crm_authenticated on public.client_plans for all to authenticated using (true) with check (true);
drop policy if exists crm_authenticated on public.client_fact_weeks;
create policy crm_authenticated on public.client_fact_weeks for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.client_plans, public.client_fact_weeks to authenticated, service_role;
grant usage, select on sequence public.client_plans_id_seq, public.client_fact_weeks_id_seq to authenticated, service_role;
select 'ok' as plan_fact;
