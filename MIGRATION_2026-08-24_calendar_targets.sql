-- План публикаций по КАЛЕНДАРНОМУ месяцу (ym = '2026-08').
-- Контрактный месяц (client_months.package) часто идёт с середины месяца — например
-- M4 = 11 июля … 10 августа. Для отчётности и для столбца «Опубл. в август»
-- нужна отдельная цифра: сколько роликов должно выйти именно в августе.
-- Тимлид проставляет её один раз — при открытии контрактного месяца.
-- Идемпотентно. Прогнать в Supabase SQL Editor.

create table if not exists public.calendar_targets (
  id         bigserial primary key,
  client_id  bigint not null references public.clients(id) on delete cascade,
  ym         text   not null,                  -- '2026-08'
  target     int    not null default 0,        -- сколько публикаций должно выйти за этот календарный месяц
  note       text,
  set_by     uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, ym)
);

create index if not exists idx_caltargets_ym on public.calendar_targets (ym);

alter table public.calendar_targets disable row level security;
grant all on table public.calendar_targets to anon, authenticated, service_role;
grant usage, select on sequence public.calendar_targets_id_seq to anon, authenticated, service_role;

drop trigger if exists calendar_targets_touch on public.calendar_targets;
create trigger calendar_targets_touch
before update on public.calendar_targets
for each row execute function public.touch_updated_at();
