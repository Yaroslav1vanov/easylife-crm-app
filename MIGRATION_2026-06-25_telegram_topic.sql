-- Привязка топика Telegram (папки клиента) к клиенту — для ИИ-бота доставки видео.
-- Идемпотентно.
alter table public.clients
  add column if not exists telegram_topic_id bigint;
