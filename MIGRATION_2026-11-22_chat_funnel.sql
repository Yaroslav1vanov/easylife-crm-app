-- Пятый чат с ИИ в карточке клиента: «Воронка» (путь от ролика до заявки: ChatPlace, ManyChat или другой сервис).
--
-- ПОРЯДОК (важно):
--   1) сначала обновить ИИ-исполнителя на сервере: скопировать ops/chat-agent/agent.py и ops/chat-agent/CLAUDE.md
--      в /srv/easylife-chat-agent/, chown chatagent, systemctl restart easylife-chat-agent;
--   2) потом запустить этот файл.
-- Пока файл не запущен, раздела «Воронка» в чате не видно: CRM показывает его только при флаге chat_funnel = on.

-- 1. Разрешаем новый раздел в переписке
alter table public.client_chat_messages drop constraint if exists client_chat_messages_thread_check;
alter table public.client_chat_messages add constraint client_chat_messages_thread_check
  check (thread in ('reels', 'stories', 'strategy', 'funnel', 'avatar'));

-- 2. Включаем раздел в интерфейсе
insert into public.app_settings (key, value, updated_at) values ('chat_funnel', 'on', now())
on conflict (key) do update set value = 'on', updated_at = now();

-- Проверка
select key, value from public.app_settings where key = 'chat_funnel';
select thread, count(*) from public.client_chat_messages group by thread order by 1;

-- Выключить раздел (переписка остаётся в базе):
-- update public.app_settings set value = 'off', updated_at = now() where key = 'chat_funnel';
