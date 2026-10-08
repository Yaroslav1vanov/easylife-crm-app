-- Чат по клиенту ↔ сценарий: «Уникализировать в чате ИИ» в карточке сценария создаёт задачу в чате «Рилсы»,
-- привязанную к сценарию. ИИ видит сценарий и референс, по «записывай» пишет текст обратно, монтирует с учётом референса.
alter table public.client_chat_messages add column if not exists script_id bigint references public.scripts(id) on delete set null;
create index if not exists client_chat_messages_script_idx on public.client_chat_messages (script_id) where script_id is not null;
select count(*) filter (where script_id is not null) as "сообщений со сценарием", count(*) as "всего" from public.client_chat_messages;
