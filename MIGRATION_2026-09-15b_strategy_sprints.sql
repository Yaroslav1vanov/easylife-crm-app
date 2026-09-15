-- Стратегия v2: забеги по 2 месяца, описание и подзадачи у задач, доступ владельцу И ассистенту.

create or replace function public.is_strategy_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'admin', 'assistant'));
$$;
grant execute on function public.is_strategy_member() to authenticated, service_role;

create table if not exists public.strategy_sprints (
  id            bigserial primary key,
  title         text not null,
  start_date    date not null,
  end_date      date not null,
  goals         text,                 -- цели забега, по одной на строку
  client_target int,                  -- цель по активным клиентам на конец забега
  status        text not null default 'active',   -- active | done | planned
  created_at    timestamptz not null default now()
);

alter table public.strategy_tasks add column if not exists description text;
alter table public.strategy_tasks add column if not exists subtasks jsonb not null default '[]'::jsonb;
alter table public.strategy_tasks add column if not exists sprint_id bigint references public.strategy_sprints(id) on delete set null;
alter table public.strategy_tasks add column if not exists sort_order int;

alter table public.strategy_sprints enable row level security;
drop policy if exists "strategy tasks owner"    on public.strategy_tasks;
drop policy if exists "strategy journal owner"  on public.strategy_journal;
drop policy if exists "strategy tasks member"   on public.strategy_tasks;
drop policy if exists "strategy journal member" on public.strategy_journal;
drop policy if exists "strategy sprints member" on public.strategy_sprints;
create policy "strategy tasks member"   on public.strategy_tasks   for all to authenticated using (public.is_strategy_member()) with check (public.is_strategy_member());
create policy "strategy journal member" on public.strategy_journal for all to authenticated using (public.is_strategy_member()) with check (public.is_strategy_member());
create policy "strategy sprints member" on public.strategy_sprints for all to authenticated using (public.is_strategy_member()) with check (public.is_strategy_member());

revoke all on table public.strategy_sprints from anon;
grant all on table public.strategy_sprints to authenticated, service_role;
grant all on sequence public.strategy_sprints_id_seq to authenticated, service_role;

-- Забег 1
insert into public.strategy_sprints (title, start_date, end_date, goals, client_target, status)
select 'Сентябрь — Октябрь 2026', '2026-09-07', '2026-10-31',
       E'18 активных клиентов к 31.10\nУдержание M1→M2 — 85% (было 67%)\n300 роликов в сентябре, 340 в октябре\nНайм: 2 тимлида, 2 монтажёра, продажник №2\nРабочий день Ярослава 3–4 часа с 01.11',
       18, 'active'
where not exists (select 1 from public.strategy_sprints);

update public.strategy_tasks t set sprint_id = s.id
from public.strategy_sprints s
where t.sprint_id is null and t.planned_for between s.start_date and s.end_date;
