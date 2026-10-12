-- Расширенная аналитика из Metricool + соавторы Instagram.
-- 1) Соавторы (Collab) у публикации.
alter table public.publications add column if not exists ig_collaborators text[];
-- 2) Удержание по ролику: длительность, доля пролистываний в первые секунды (IG), полный досмотр (TikTok).
alter table public.reel_snapshots add column if not exists duration_sec numeric(7,2);
alter table public.reel_snapshots add column if not exists skip_rate numeric(5,2);
alter table public.reel_snapshots add column if not exists full_watch_rate numeric(5,2);
-- 3) То же у сценария — видно в карточке рядом с «Исходник vs наше».
alter table public.scripts add column if not exists our_retention_pct numeric(5,1);
alter table public.scripts add column if not exists our_skip_rate numeric(5,1);
-- 4) Просмотры аккаунта по дням: от подписчиков / от новых людей и по типу (рилсы / сторис / посты).
create table if not exists public.client_view_breakdown (
  id bigserial primary key,
  client_id bigint not null references public.clients(id) on delete cascade,
  day date not null,
  followers_views bigint, nonfollowers_views bigint,
  reels_views bigint, stories_views bigint, posts_views bigint,
  updated_at timestamptz not null default now(),
  unique (client_id, day)
);
alter table public.client_view_breakdown enable row level security;
drop policy if exists crm_authenticated on public.client_view_breakdown;
create policy crm_authenticated on public.client_view_breakdown for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.client_view_breakdown to authenticated, service_role;
grant usage, select on sequence public.client_view_breakdown_id_seq to authenticated, service_role;
select 'ok' as metricool_analytics;
