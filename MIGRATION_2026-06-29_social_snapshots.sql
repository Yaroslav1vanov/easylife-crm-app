-- ============================================================================
-- Соц-снапшоты для карточек клиентов (Клиенты). Наполняются по кнопке
-- «Обновить статистику» из Metricool (followers / reach 30д / ER). Без крона.
-- Создаёт таблицу (если ещё нет) и проставляет права на запись для anon.
-- Идемпотентно. Прогонять в Supabase SQL Editor.
-- ============================================================================

create table if not exists public.social_snapshots (
  id              bigserial primary key,
  client_id       bigint not null references public.clients(id) on delete cascade,
  platform        text not null check (platform in ('ig', 'tt', 'yt')),
  snapshot_date   date not null,
  followers       bigint,
  reach_30d       bigint,
  engagement_rate numeric(7, 2),
  created_at      timestamptz not null default now(),
  unique (client_id, platform, snapshot_date)
);

create index if not exists idx_social_snapshots_lookup
  on public.social_snapshots (client_id, platform, snapshot_date desc);

-- права на запись (для таблиц из чистого SQL не проставляются автоматически)
grant all privileges on table public.social_snapshots to anon, authenticated, service_role;
grant all privileges on sequence public.social_snapshots_id_seq to anon, authenticated, service_role;

-- RLS: раздел уже за авторизацией → разрешаем чтение и запись
alter table public.social_snapshots enable row level security;
drop policy if exists "Authenticated users can read social snapshots" on public.social_snapshots;
drop policy if exists "ss all" on public.social_snapshots;
create policy "ss all" on public.social_snapshots for all using (true) with check (true);
