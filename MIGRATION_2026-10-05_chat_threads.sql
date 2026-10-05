-- Два чата с ИИ в карточке клиента: «Рилсы» и «Сторис».
-- Только новая колонка с значением по умолчанию: все старые сообщения остаются в «Рилсах».
alter table public.client_chat_messages
  add column if not exists thread text not null default 'reels';

alter table public.client_chat_messages drop constraint if exists client_chat_messages_thread_check;
alter table public.client_chat_messages
  add constraint client_chat_messages_thread_check check (thread in ('reels', 'stories'));

create index if not exists client_chat_messages_thread_idx
  on public.client_chat_messages (client_id, thread, id);

-- Проверка
select thread, count(*) from public.client_chat_messages group by thread;
