-- ============================================================================
-- Раздел «Публикации»: пайплайн адаптации текста под соцсети + выгрузка в Metricool.
-- Идемпотентно. Безопасно прогонять повторно в Supabase SQL Editor.
-- Включает поля из metricool_snapshots (на случай, если та миграция не была прогнана).
-- ============================================================================

-- 1) Поля клиента ------------------------------------------------------------
alter table public.clients
  add column if not exists metricool_blog_id bigint,                 -- id бренда в Metricool (своё на клиента)
  add column if not exists platforms text[] default '{}',            -- где клиент ведётся: ig/tt/yt/threads
  add column if not exists brand_voice text,                         -- тон голоса (markdown) — основа AI-адаптации
  add column if not exists timezone text default 'Europe/Kyiv',      -- для расписания публикаций
  add column if not exists default_post_time time default '10:00';   -- дефолтное время поста

-- 2) Таблица публикаций (1:1 со сценарием) -----------------------------------
create table if not exists public.publications (
  id              bigserial primary key,
  script_id       bigint not null unique references public.scripts(id) on delete cascade,
  client_id       bigint not null references public.clients(id) on delete cascade,

  -- готовое видео
  video_url           text,
  video_thumbnail_url text,
  publish_at          timestamptz,                  -- когда публиковать (Metricool сам выдержит время)
  target_channels     text[] default '{}',          -- подмножество ig/tt/yt/threads

  -- исходный текст (из сценария) и 4 адаптации
  base_text       text,
  caption_ig      text,
  caption_tt      text,
  yt_title        text,
  yt_description  text,
  yt_tags         text[],
  threads_post    text,

  -- AI-метаданные
  ai_generated_at timestamptz,
  ai_model        text,

  -- утверждение тимлидом
  approved_by     bigint references public.team_members(id),
  approved_at     timestamptz,

  -- состояние публикации
  pub_status      text not null default 'adapting'
                  check (pub_status in ('adapting','review','queued','scheduled','published','error')),
  metricool_post_id text,
  published_urls    jsonb,                           -- {ig:"...", tt:"...", yt:"...", threads:"..."}
  error_message     text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_publications_client on public.publications (client_id);
create index if not exists idx_publications_status on public.publications (pub_status);
create index if not exists idx_publications_pub_at on public.publications (publish_at);

-- 3) RLS: залогиненный пользователь читает и пишет (доступ к разделу уже за авторизацией) ----
alter table public.publications enable row level security;

drop policy if exists "auth read publications"   on public.publications;
drop policy if exists "auth insert publications" on public.publications;
drop policy if exists "auth update publications" on public.publications;
drop policy if exists "auth delete publications" on public.publications;

create policy "pub read"   on public.publications for select using (true);
create policy "pub insert" on public.publications for insert with check (true);
create policy "pub update" on public.publications for update using (true) with check (true);
create policy "pub delete" on public.publications for delete using (true);

-- 4) Автообновление updated_at ----------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_publications_touch on public.publications;
create trigger trg_publications_touch
  before update on public.publications
  for each row execute function public.touch_updated_at();
