-- Шестой чат с ИИ в карточке клиента: «Аналитика» (разбор цифр роликов: почему залетел или нет, где уходят зрители).
-- Виден во вкладке «Аналитика» → «💬 Чат с ИИ» и во вкладке «Чат·ИИ».
-- ИИ-исполнитель на сервере уже обновлён (понимает чат «Аналитика» и получает ANALYTICS.md).

-- 1. Разрешаем новый раздел в переписке
alter table public.client_chat_messages drop constraint if exists client_chat_messages_thread_check;
alter table public.client_chat_messages add constraint client_chat_messages_thread_check
  check (thread in ('reels', 'stories', 'strategy', 'funnel', 'analytics', 'avatar'));

-- 2. Включаем раздел в интерфейсе
insert into public.app_settings (key, value, updated_at) values ('chat_analytics', 'on', now())
on conflict (key) do update set value = 'on', updated_at = now();

-- Проверка
select key, value from public.app_settings where key in ('chat_funnel', 'chat_analytics');

-- Выключить раздел (переписка остаётся в базе):
-- update public.app_settings set value = 'off', updated_at = now() where key = 'chat_analytics';
