-- Ручные корректировки расчёта ЗП (раздел «ЗП команды», только владелец).
-- Расчёт сам по себе вычисляется из скриптов на лету; здесь храним ТОЛЬКО правки поверх него:
--   done/published  — переопределение счётчиков (авансы, договорённости). NULL = считать автоматически.
--   on_time/onboarding/renewal — принудительное вкл/выкл бонуса. NULL = решает автомат.
-- Одна строка = один (календарный месяц × клиент×контрактный месяц).
-- Идемпотентно.

create table if not exists public.payroll_adjustments (
  id          bigserial primary key,
  ym          text    not null,               -- календарный месяц: '2026-07'
  row_id      text    not null,               -- ключ строки расчёта: 'crm-{client_id}-{month_number}'
  done        integer,                        -- смонтировано (переопределение), NULL = авто
  published   integer,                        -- опубликовано (переопределение), NULL = авто
  on_time     boolean,                        -- бонус «в срок»,   NULL = авто
  onboarding  boolean,                        -- бонус онбординга, NULL = авто
  renewal     boolean,                        -- бонус продления,  NULL = авто
  -- Фиксированная сумма вместо расчёта (клиенты с нестандартной оплатой, напр. Владимир Amazon).
  editor_amount  numeric,                     -- монтажёру за этого клиента, NULL = считать по ставке
  tl_amount      numeric,                     -- тимлиду за этого клиента,   NULL = считать по ставке
  note        text,                           -- зачем поправили
  updated_at  timestamptz not null default now(),
  unique (ym, row_id)
);

create index if not exists payroll_adjustments_ym_idx on public.payroll_adjustments (ym);

alter table public.payroll_adjustments enable row level security;

-- Читать может приложение (сами по себе это количества роликов, не суммы).
drop policy if exists payroll_adjustments_select on public.payroll_adjustments;
create policy payroll_adjustments_select on public.payroll_adjustments
  for select using (true);

-- Писать — только владелец/админ (ЗП правит один человек).
drop policy if exists payroll_adjustments_write on public.payroll_adjustments;
create policy payroll_adjustments_write on public.payroll_adjustments
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'admin')));

grant select on public.payroll_adjustments to anon, authenticated;
grant insert, update, delete on public.payroll_adjustments to authenticated;
grant usage, select on sequence public.payroll_adjustments_id_seq to authenticated;
