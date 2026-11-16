-- Тип ролика: основной (в счёт пакета, оплачивается) или пробный (тест, сверх пакета, не оплачивается).
-- Это НЕ то же самое, что publications.ig_trial (режим «Пробный рилс» в Instagram): основной ролик тоже можно выложить пробным.
alter table public.scripts add column if not exists is_trial boolean not null default false;
