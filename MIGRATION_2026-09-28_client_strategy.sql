-- ─────────────────────────────────────────────────────────────────────────────
-- Вкладка «Стратегия» в карточке клиента.
-- Всё, что нужно команде и ИИ, чтобы работать с клиентом в одном стиле:
-- аудит, контент-стратегия, бренд-кит (цвета, шрифты, голос), медиатека.
--
-- Только НОВЫЕ таблицы. Ничего существующего не меняется.
-- Откат:  drop table client_assets, client_documents, client_brand cascade;
-- ─────────────────────────────────────────────────────────────────────────────

-- Бренд-кит: один на клиента. Формат — единый для всех инструментов производства.
create table if not exists public.client_brand (
  client_id   bigint primary key references public.clients(id) on delete cascade,
  kit         jsonb not null default '{}'::jsonb,
  version     integer not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- Документы: аудит, контент-стратегия, бриф.
-- Текстовые (стратегия) хранятся прямо здесь и правятся в CRM.
-- Файловые (аудит в HTML) лежат в хранилище, здесь — ссылка на них.
-- Каждое сохранение — новая версия: старая остаётся с is_current = false.
create table if not exists public.client_documents (
  id          bigserial primary key,
  client_id   bigint not null references public.clients(id) on delete cascade,
  kind        text not null check (kind in ('audit','strategy','content_plan','brief','other')),
  title       text not null,
  body        text,
  file_key    text,
  version     integer not null default 1,
  is_current  boolean not null default true,
  note        text,
  created_by  uuid,
  author_name text,
  created_at  timestamptz not null default now()
);
create index if not exists client_documents_client_idx on public.client_documents (client_id, kind, is_current);

-- Медиатека: фото, видео, логотипы, шрифты клиента.
-- Пометки на каждом файле — чтобы фото с лицом без согласия не попало в производство.
create table if not exists public.client_assets (
  id          bigserial primary key,
  client_id   bigint not null references public.clients(id) on delete cascade,
  file_key    text not null,
  category    text not null check (category in
                ('logo','font','portrait','process','location','result','review','generated','story','other')),
  kind        text not null default 'image' check (kind in ('image','video','font','other')),
  title       text,
  tags        text[] not null default '{}',
  has_face    boolean not null default false,
  consent     text not null default 'unknown' check (consent in ('yes','no','not_needed','unknown')),
  source      text not null default 'team' check (source in ('client','team','ai')),
  usable      boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists client_assets_client_idx on public.client_assets (client_id, category);

-- Доступ — по тем же правилам, что и у остальных таблиц CRM (rls_lockdown 26.09).
do $$
declare t text;
begin
  foreach t in array array['client_brand','client_documents','client_assets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists crm_authenticated on public.%I', t);
    execute format('create policy crm_authenticated on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Проверка: должно вернуть три строки
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('client_brand','client_documents','client_assets');
