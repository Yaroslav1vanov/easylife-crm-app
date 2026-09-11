-- Monthly social stats per client: one row per client x month x network.
-- Collected from Metricool (content) + social_snapshots (followers).
create table if not exists public.client_monthly_stats (
  id              bigserial primary key,
  client_id       bigint not null references public.clients(id) on delete cascade,
  ym              text   not null,            -- '2026-08'
  network         text   not null,            -- instagram | tiktok | youtube | facebook
  reels_count     int,
  posts_count     int,
  views           bigint,
  reach           bigint,
  likes           bigint,
  comments        bigint,
  saves           bigint,
  shares          bigint,
  interactions    bigint,
  avg_watch_sec   numeric,
  followers_start int,
  followers_end   int,
  top_posts       jsonb,                      -- best 5 posts of the month
  source          text,
  collected_at    timestamptz not null default now(),
  unique (client_id, ym, network)
);
create index if not exists idx_cms_client on public.client_monthly_stats (client_id, ym);

alter table public.client_monthly_stats enable row level security;
drop policy if exists "cms read"   on public.client_monthly_stats;
drop policy if exists "cms write"  on public.client_monthly_stats;
create policy "cms read"  on public.client_monthly_stats for select using (true);
create policy "cms write" on public.client_monthly_stats for all using (true) with check (true);
grant all on table public.client_monthly_stats to anon, authenticated, service_role;
grant all on sequence public.client_monthly_stats_id_seq to anon, authenticated, service_role;
