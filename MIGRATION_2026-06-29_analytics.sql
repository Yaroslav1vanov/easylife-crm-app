-- ============================================================================
-- Аналитика из Metricool. Две таблицы-снапшота, которые ежедневно наполняет крон.
-- analytics_daily  — account-level метрики на дату (подписчики/охват/просмотры).
--                    Кривая роста = наши снапшоты во времени (IG-followers timeline
--                    в API Metricool нет, поэтому копим сами).
-- analytics_posts  — метрики каждого опубликованного поста (перформанс + лучшие).
-- Идемпотентно. Прогонять в Supabase SQL Editor.
-- ============================================================================

-- 1) Дневной снапшот аккаунта (1 строка на клиента×сеть×день) -------------------
create table if not exists public.analytics_daily (
  id               bigserial primary key,
  client_id        bigint not null references public.clients(id) on delete cascade,
  blog_id          bigint,
  network          text not null,                 -- ig | tt | yt | threads | facebook
  snap_date        date not null,
  followers        integer,                       -- текущее число подписчиков
  reach            integer,                       -- охват за день
  views            integer,                       -- просмотры за день
  accounts_engaged integer,
  raw              jsonb,                          -- полный ответ Metricool (страховка)
  created_at       timestamptz not null default now(),
  unique (client_id, network, snap_date)
);
create index if not exists idx_analytics_daily_client on public.analytics_daily (client_id, snap_date);

-- 2) Метрики постов (1 строка на клиента×сеть×post_id, обновляется при пересчёте) -
create table if not exists public.analytics_posts (
  id            bigserial primary key,
  client_id     bigint not null references public.clients(id) on delete cascade,
  blog_id       bigint,
  network       text not null,
  post_id       text not null,                    -- id поста в сети
  post_type     text,                             -- post | reel | video
  published_at  timestamptz,
  url           text,
  thumbnail_url text,
  content       text,
  views         integer,
  likes         integer,
  comments      integer,
  shares        integer,
  saved         integer,
  reach         integer,
  engagement    numeric,                          -- ER (доля или %, как отдаёт Metricool)
  raw           jsonb,
  fetched_at    timestamptz not null default now(),
  unique (client_id, network, post_id)
);
create index if not exists idx_analytics_posts_client on public.analytics_posts (client_id, published_at desc);
create index if not exists idx_analytics_posts_views on public.analytics_posts (views desc);

-- привилегии (для таблиц из чистого SQL не проставляются автоматически) ----------
grant all privileges on table public.analytics_daily, public.analytics_posts to anon, authenticated, service_role;
grant all privileges on sequence public.analytics_daily_id_seq, public.analytics_posts_id_seq to anon, authenticated, service_role;

-- RLS: доступ к разделу уже за авторизацией ------------------------------------
alter table public.analytics_daily enable row level security;
alter table public.analytics_posts enable row level security;
drop policy if exists "ad all" on public.analytics_daily;
drop policy if exists "ap all" on public.analytics_posts;
create policy "ad all" on public.analytics_daily for all using (true) with check (true);
create policy "ap all" on public.analytics_posts for all using (true) with check (true);
