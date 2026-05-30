-- Metricool integration: client mapping and daily social-stat snapshots.
-- Safe to run repeatedly in Supabase SQL Editor.

alter table public.clients
  add column if not exists metricool_blog_id bigint,
  add column if not exists platforms text[] default '{}';

create table if not exists public.social_snapshots (
  id bigserial primary key,
  client_id bigint not null references public.clients(id) on delete cascade,
  platform text not null check (platform in ('ig', 'tt', 'yt')),
  snapshot_date date not null,
  followers bigint,
  reach_30d bigint,
  engagement_rate numeric(7, 2),
  created_at timestamptz not null default now(),
  unique (client_id, platform, snapshot_date)
);

create index if not exists idx_social_snapshots_lookup
  on public.social_snapshots (client_id, platform, snapshot_date desc);

alter table public.social_snapshots enable row level security;

drop policy if exists "Authenticated users can read social snapshots" on public.social_snapshots;
create policy "Authenticated users can read social snapshots"
  on public.social_snapshots
  for select
  to authenticated
  using (true);

