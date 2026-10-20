-- Недельная статистика: ролик в трёх сетях = 1 ролик + сколько публикаций по площадкам (20.10.2026).
alter table public.client_weekly_stats
  add column if not exists posts_count int,
  add column if not exists by_net jsonb;
select 'ok' as result;
