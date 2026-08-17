-- Дата НАЧАЛА онбординга. Раньше начало брали из clients.start_date (старт работы с клиентом),
-- но онбординг может стартовать позже — теперь период задаётся явно: с onboarding_start
-- по onboarding_deadline. Если поле пустое — как и раньше, отсчёт от start_date.
-- Идемпотентно.

alter table public.clients
  add column if not exists onboarding_start date;

comment on column public.clients.onboarding_start is
  'Начало онбординга. NULL → считаем от clients.start_date.';
