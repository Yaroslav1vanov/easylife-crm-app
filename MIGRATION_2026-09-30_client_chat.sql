-- ============================================================
-- Чат по клиенту в карточке + ИИ-исполнитель (пилот на карточке «Ярослав Иванов»).
--
-- Каждое сообщение принадлежит карточке клиента. Файлы (видео аватара, готовый
-- монтаж, кадры сторис) лежат в R2 в папке strategy/{клиент}/chat/, в сообщении —
-- только ссылки на них. Если у клиента включён ИИ-чат, сообщение сотрудника
-- получает статус «в очереди», его забирает исполнитель на сервере, и ответ ИИ
-- приходит в тот же чат.
-- Только новые объекты; существующие таблицы, кроме флага в clients, не меняются.
-- ============================================================

create table if not exists public.client_chat_messages (
  id           bigserial primary key,
  client_id    bigint not null references public.clients(id) on delete cascade,
  author_type  text not null check (author_type in ('user', 'ai', 'system')),
  author_id    uuid,
  author_name  text,
  body         text not null default '',
  attachments  jsonb not null default '[]'::jsonb,   -- [{key, name, type, size}]
  ai_status    text check (ai_status in ('queued', 'working', 'done', 'error')),
  ai_error     text,
  reply_to     bigint references public.client_chat_messages(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists client_chat_messages_client_idx on public.client_chat_messages (client_id, id);
create index if not exists client_chat_messages_queue_idx on public.client_chat_messages (ai_status, id)
  where ai_status in ('queued', 'working');

-- ИИ в чате включается по клиенту (пилот — только карточка 31)
alter table public.clients add column if not exists ai_chat boolean not null default false;
update public.clients set ai_chat = true where id = 31;

-- Доступ: как у всей CRM после закрытия базы — вошедшие сотрудники и служебный ключ.
alter table public.client_chat_messages enable row level security;
drop policy if exists crm_authenticated on public.client_chat_messages;
create policy crm_authenticated on public.client_chat_messages
  for all to authenticated using (true) with check (true);

-- Права (урок 29.09: без них таблица есть, а читать её нельзя)
grant select, insert, update, delete on public.client_chat_messages to authenticated, service_role;
grant usage, select on sequence public.client_chat_messages_id_seq to authenticated, service_role;

-- Проверка
select has_table_privilege('authenticated', 'public.client_chat_messages', 'SELECT,INSERT') as "сотрудник",
       has_table_privilege('service_role',  'public.client_chat_messages', 'SELECT,INSERT,UPDATE') as "исполнитель",
       (select ai_chat from public.clients where id = 31) as "ИИ у карточки 31";
