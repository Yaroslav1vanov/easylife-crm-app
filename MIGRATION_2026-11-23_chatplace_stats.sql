-- Статистика Instagram из ChatPlace (официальный API Instagram через бота клиента).
-- Даёт то, чего нет в Metricool: визиты в профиль, переходы на сайт, подписки/отписки, страны/возраст/пол,
-- среднее время просмотра и пролистывания по ролику, входы в воронки по кодовым словам.
-- Запускает Ярослав. После запуска CRM начнёт собирать данные при «Обновить» и каждый день в 05:00 UTC.

-- 1. Бот ChatPlace в карточке клиента (UUID бота = Instagram-аккаунт клиента в ChatPlace)
alter table public.clients add column if not exists chatplace_bot_id text;

-- Facto Auto (@factoauto.us) — единственный бот, у которого ChatPlace сейчас отдаёт статистику
update public.clients set chatplace_bot_id = '01a18c92-cf26-71b4-ba68-70ccc8a51557' where id = 45;

-- 2. Ежедневный снимок статистики ChatPlace по клиенту
create table if not exists public.client_chatplace_insights (
  id bigserial primary key,
  client_id bigint not null references public.clients(id) on delete cascade,
  day date not null,
  bot_id text not null,
  availability text,            -- available / no_permission / pending / unavailable
  summary jsonb,                -- итог аккаунта за 30 дней + страны, возраст, пол, кто смотрит
  videos jsonb,                 -- ролики за 90 дней (до 30 штук): просмотры, ср. время, пролистывания
  funnels jsonb,                -- воронки бота: кодовые слова, статус, сколько людей зашло
  updated_at timestamptz not null default now(),
  unique (client_id, day)
);
alter table public.client_chatplace_insights enable row level security;
drop policy if exists crm_authenticated on public.client_chatplace_insights;
create policy crm_authenticated on public.client_chatplace_insights for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.client_chatplace_insights to authenticated, service_role;
grant usage, select on sequence public.client_chatplace_insights_id_seq to authenticated, service_role;

-- Проверка
select id, name, chatplace_bot_id from public.clients where chatplace_bot_id is not null;
select 'ok' as chatplace_stats;
