-- Стратегия EasyLife AI: задачи дорожной карты и журнал CEO-агента («мозг системы»).
-- Видит и правит ТОЛЬКО владелец/админ (RLS). Бот ходит через /api/strategy/agent на service_role.

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'admin'));
$$;
grant execute on function public.is_owner() to authenticated, service_role;

create table if not exists public.strategy_tasks (
  id          bigserial primary key,
  text        text not null,
  status      text not null default 'open',      -- open | done | cancelled | delegated | backlog
  priority    text not null default 'A',         -- A | B | C
  direction   text,                              -- Удержание, Трафик, Продажи, Производство, HR, Деньги, Разгрузка, Итог
  planned_for date,
  owner       text,                              -- кому делегировано
  result      text,                              -- итог / комментарий
  source      text default 'crm',                -- crm | roadmap_sep_oct | telegram | memory_extract …
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index if not exists strategy_tasks_planned_idx on public.strategy_tasks (planned_for);

create table if not exists public.strategy_journal (
  id         bigserial primary key,
  kind       text not null,                      -- plan | push | review | decision | note
  day        date not null default current_date,
  text       text not null,
  source     text not null default 'agent',      -- agent | crm
  created_at timestamptz not null default now()
);
create index if not exists strategy_journal_day_idx on public.strategy_journal (day desc, id desc);

alter table public.strategy_tasks   enable row level security;
alter table public.strategy_journal enable row level security;

drop policy if exists "strategy tasks owner"   on public.strategy_tasks;
drop policy if exists "strategy journal owner" on public.strategy_journal;
create policy "strategy tasks owner"   on public.strategy_tasks   for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "strategy journal owner" on public.strategy_journal for all to authenticated using (public.is_owner()) with check (public.is_owner());

revoke all on table public.strategy_tasks, public.strategy_journal from anon;
grant all on table public.strategy_tasks, public.strategy_journal to authenticated, service_role;
grant all on sequence public.strategy_tasks_id_seq, public.strategy_journal_id_seq to authenticated, service_role;
