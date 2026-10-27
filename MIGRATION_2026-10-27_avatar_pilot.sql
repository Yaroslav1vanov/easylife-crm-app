-- ============================================================
-- ТЗ «аватары HeyGen в CRM», п. 8 (пилот) + хранилище из п. 2.
--
-- 1) clients.is_internal — своя карточка агентства: работает как обычный клиент
--    (сценарии, монтаж, чат, публикации), но не идёт в ЗП, план/факт, нагрузку
--    команды, счёт клиентов и статистику агентства. Первая — «Ярослав — личный блог» (31).
-- 2) client_avatars — какой аватар HeyGen закреплён за клиентом: группа, разрешённые
--    луки, голос, движок, месячный лимит видео. Исполнитель генерирует ТОЛЬКО из этого
--    списка (проверка кодом на сервере, п. 3). Менять может только владелец.
-- ============================================================

alter table public.clients add column if not exists is_internal boolean not null default false;
update public.clients set is_internal = true, niche = 'Ярослав — личный блог (внутренний проект)' where id = 31;

create table if not exists public.client_avatars (
  client_id        bigint primary key references public.clients(id) on delete restrict,
  heygen_group_id  text not null,
  look_ids         text[] not null default '{}',        -- разрешённые луки (3–5)
  default_look_id  text,
  look_names       jsonb not null default '{}'::jsonb,  -- {look_id: "название"} для подписи в интерфейсе
  voice_id         text,
  voice_model      text not null default 'eleven_v4',
  engine           text not null default 'avatar_v' check (engine in ('avatar_iii', 'avatar_iv', 'avatar_v', 'avatar_vi')),
  aspect           text not null default '9:16',
  resolution       text not null default '1080p',
  monthly_limit    int,                                 -- видео в месяц; null = по пакету (30 → 40, 20 → 28)
  language         text not null default 'ru' check (language in ('ru', 'uk', 'en')),
  voice_speed      numeric(3,2) not null default 1.00,  -- у Ярослава 1.2x
  trim_silence     boolean not null default true,       -- обрезать тишину в начале и конце озвучки
  updated_at       timestamptz not null default now(),
  updated_by       uuid,
  check (default_look_id is null or default_look_id = any(look_ids))
);

alter table public.client_avatars enable row level security;
drop policy if exists avatars_read on public.client_avatars;
drop policy if exists avatars_owner_write on public.client_avatars;
create policy avatars_read on public.client_avatars for select to authenticated using (true);
create policy avatars_owner_write on public.client_avatars for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on public.client_avatars to authenticated;   -- писать пустит только политика владельца
grant select, insert, update, delete on public.client_avatars to service_role;

-- Пилот: аватар Ярослава
insert into public.client_avatars (client_id, heygen_group_id, look_ids, default_look_id, look_names, voice_id, voice_model, engine, monthly_limit, language, voice_speed)
values (31, '733c2aedebf84354886e226111ba6354',
        array['bc2719178c90484a81455e35c12dcc85', 'b61035094175479eafbf09d2600ce7e9'],
        'bc2719178c90484a81455e35c12dcc85',
        '{"bc2719178c90484a81455e35c12dcc85": "Ярослав Иванов — 72", "b61035094175479eafbf09d2600ce7e9": "Ярослав спокойный"}'::jsonb,
        '648ff327e88a45e89d923254ddfa5991', 'eleven_v4', 'avatar_v', 40, 'ru', 1.20)
on conflict (client_id) do nothing;

-- Словарь произношения клиента: как написано → как озвучивать. ИИ применяет перед каждой озвучкой.
-- Дополнять могут все, править и удалять — только владелец.
create table if not exists public.client_avatar_dictionary (
  id          bigserial primary key,
  client_id   bigint not null references public.clients(id) on delete restrict,
  written     text not null,
  spoken      text not null,
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (client_id, written)
);
alter table public.client_avatar_dictionary enable row level security;
drop policy if exists dict_read on public.client_avatar_dictionary;
drop policy if exists dict_add on public.client_avatar_dictionary;
drop policy if exists dict_owner on public.client_avatar_dictionary;
drop policy if exists dict_owner_del on public.client_avatar_dictionary;
create policy dict_read on public.client_avatar_dictionary for select to authenticated using (true);
create policy dict_add on public.client_avatar_dictionary for insert to authenticated with check (true);
create policy dict_owner on public.client_avatar_dictionary for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy dict_owner_del on public.client_avatar_dictionary for delete to authenticated using (public.is_owner());
grant select, insert, update, delete on public.client_avatar_dictionary to authenticated, service_role;
grant usage, select on sequence public.client_avatar_dictionary_id_seq to authenticated, service_role;

-- Журнал генераций HeyGen (= траты кредитов): одна строка = одна озвучка / видео / создание аватара.
-- Пишет только сервер (API заказа и исполнитель); сотрудники читают — для карточки и «ИИ-расходов».
create table if not exists public.avatar_generations (
  id             bigserial primary key,
  client_id      bigint not null references public.clients(id) on delete restrict,
  kind           text not null check (kind in ('voice', 'video', 'avatar')),
  status         text not null default 'queued' check (status in ('queued', 'working', 'done', 'error')),
  message_id     bigint references public.client_chat_messages(id) on delete set null,   -- задача в чате «Аватар»
  script_id      bigint references public.scripts(id) on delete set null,
  look_id        text,
  voice_id       text,
  engine         text,
  text           text,                    -- текст с тегами эмоций (для озвучки)
  source_key     text,                    -- аудио, из которого делается видео
  result_key     text,                    -- готовый файл в нашем хранилище (медиатека)
  heygen_id      text,
  seconds        numeric(7,2),
  credits_before numeric(10,2),
  credits_after  numeric(10,2),
  is_redo        boolean not null default false,
  over_limit_ok  boolean not null default false,   -- сверх лимита, подтвердил Ярослав
  requested_by   uuid,
  requested_name text,
  error          text,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz
);
create index if not exists avatar_generations_client_idx on public.avatar_generations (client_id, created_at desc);
alter table public.avatar_generations enable row level security;
drop policy if exists gen_read on public.avatar_generations;
create policy gen_read on public.avatar_generations for select to authenticated using (true);
grant select on public.avatar_generations to authenticated;
grant select, insert, update on public.avatar_generations to service_role;
grant usage, select on sequence public.avatar_generations_id_seq to service_role;

-- Четвёртый чат «Аватар» + данные карточек (заказ озвучки, параметры генерации)
alter table public.client_chat_messages drop constraint if exists client_chat_messages_thread_check;
alter table public.client_chat_messages add constraint client_chat_messages_thread_check
  check (thread in ('reels', 'stories', 'strategy', 'avatar'));
alter table public.client_chat_messages add column if not exists meta jsonb;

-- Проверка
select c.id, c.name, c.is_internal, c.niche, a.engine, a.voice_model, array_length(a.look_ids, 1) as "луков", a.monthly_limit
from public.clients c left join public.client_avatars a on a.client_id = c.id where c.id = 31;
