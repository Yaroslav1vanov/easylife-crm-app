-- Недельные итоги по клиенту за всё время работы: одна строка на неделю (пн–вс).
-- Источник — Metricool (ролики недели) + наши снимки подписчиков + CRM (сколько роликов наших).
-- Заполняет /api/stats/collect-week и ежедневный крон /api/cron/weekly-stats.
create table if not exists public.client_weekly_stats (
  id             bigserial primary key,
  client_id      bigint not null references public.clients(id) on delete cascade,
  week_start     date not null,
  week_end       date not null,
  reels_count    int,
  our_videos     int,
  views          bigint, reach bigint, likes int, comments int, saves int, shares int,
  er             numeric(5,2),
  avg_retention  int,
  followers_end  int,
  followers_gained int,
  followers_lost   int,
  top_post       jsonb,
  collected_at   timestamptz not null default now(),
  unique (client_id, week_start)
);
create index if not exists cws_client_idx on public.client_weekly_stats (client_id, week_start desc);

alter table public.client_weekly_stats enable row level security;
drop policy if exists "cws read"  on public.client_weekly_stats;
drop policy if exists "cws write" on public.client_weekly_stats;
create policy "cws read"  on public.client_weekly_stats for select using (true);
create policy "cws write" on public.client_weekly_stats for all using (true) with check (true);
grant all on table public.client_weekly_stats to anon, authenticated, service_role;
grant all on sequence public.client_weekly_stats_id_seq to anon, authenticated, service_role;
