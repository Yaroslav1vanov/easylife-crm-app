-- Соавторы Instagram (Collab): ники аккаунтов, которых приглашаем в соавторы рилса/поста при публикации через Metricool.
-- Пост появляется в лентах обоих аккаунтов после того, как соавтор примет приглашение.
alter table public.publications add column if not exists ig_collaborators text[];
