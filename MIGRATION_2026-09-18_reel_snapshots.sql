-- Ежедневные снимки метрик по каждому ролику: чтобы сравнивать недели «в одинаковом возрасте ролика»,
-- а не свежие ролики против созревших. Пишет крон /api/cron/reel-snapshots раз в сутки.
create table if not exists public.reel_snapshots (
  id            bigserial primary key,
  client_id     bigint not null references public.clients(id) on delete cascade,
  network       text not null,                 -- instagram | tiktok | youtube | facebook
  post_url      text not null,                 -- ссылка на ролик = его идентификатор
  published_at  date,
  snapshot_date date not null default current_date,
  age_days      int,                           -- сколько дней ролику на момент снимка
  views         bigint, reach bigint, likes int, comments int, saves int, shares int,
  avg_watch_sec numeric(6,2),
  created_at    timestamptz not null default now(),
  unique (client_id, post_url, snapshot_date)
);
create index if not exists reel_snapshots_client_idx on public.reel_snapshots (client_id, published_at desc);
create index if not exists reel_snapshots_age_idx on public.reel_snapshots (client_id, age_days);

alter table public.reel_snapshots enable row level security;
drop policy if exists "reel snap read"  on public.reel_snapshots;
drop policy if exists "reel snap write" on public.reel_snapshots;
create policy "reel snap read"  on public.reel_snapshots for select using (true);
create policy "reel snap write" on public.reel_snapshots for all using (true) with check (true);
grant all on table public.reel_snapshots to anon, authenticated, service_role;
grant all on sequence public.reel_snapshots_id_seq to anon, authenticated, service_role;
