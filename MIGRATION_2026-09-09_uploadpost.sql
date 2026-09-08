-- Куда публикуем этого клиента: metricool (по умолчанию) или uploadpost.
-- Upload-Post: аккаунт заводит сам клиент, у профиля свои подключённые соцсети.
alter table public.clients add column if not exists publisher text not null default 'metricool';
alter table public.clients add column if not exists uploadpost_profile text;
