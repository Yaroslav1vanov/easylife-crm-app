-- Лимиты подписки Claude в пульсе сервера (страница «ИИ-чат: аналитика», видит только владелец).
-- Исполнитель раз в 15 минут снимает загрузку 5-часового окна и недели из заголовков ответа Anthropic.
alter table public.server_status add column if not exists claude_5h_util numeric(5,3);
alter table public.server_status add column if not exists claude_5h_reset timestamptz;
alter table public.server_status add column if not exists claude_7d_util numeric(5,3);
alter table public.server_status add column if not exists claude_7d_reset timestamptz;
alter table public.server_status add column if not exists claude_status text;
alter table public.server_status add column if not exists claude_overage text;
select column_name from information_schema.columns where table_name = 'server_status' and column_name like 'claude%' order by 1;
