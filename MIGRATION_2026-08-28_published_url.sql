-- Разделяем две разные ссылки:
--   video_url     — файл смонтированного ролика (R2), его CRM отдаёт в Metricool;
--   published_url — ссылка на уже вышедший пост в соцсети, по ней собирается статистика.
alter table public.scripts add column if not exists published_url text;
