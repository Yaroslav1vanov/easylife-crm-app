-- Проверка сценария на стоп-слова Instagram (кнопка в карточке сценария): результат ИИ и время проверки.
alter table public.scripts add column if not exists stopcheck jsonb;
alter table public.scripts add column if not exists stopcheck_at timestamptz;
