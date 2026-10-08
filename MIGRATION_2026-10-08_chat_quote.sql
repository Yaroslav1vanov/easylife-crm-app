-- «Ответить» на конкретное сообщение в чате по клиенту: ИИ получает процитированное сообщение целиком
-- и понимает, к какому шагу/варианту относится правка (а не к последнему сообщению).
alter table public.client_chat_messages add column if not exists quote_id bigint references public.client_chat_messages(id) on delete set null;
