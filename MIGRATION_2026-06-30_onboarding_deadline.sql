-- ============================================================================
-- Онбординг как видимая фаза с фиксированной датой окончания.
-- Добавляет редактируемое поле onboarding_deadline (по умолчанию старт + 10 дней).
-- Идемпотентно. Прогонять в Supabase SQL Editor.
-- ============================================================================

alter table public.clients
  add column if not exists onboarding_deadline date;

-- Бэкфилл: тем, у кого ещё не задано — старт + 10 дней
-- (или существующий scripts_deadline, если он был выставлен при создании).
update public.clients
set onboarding_deadline = coalesce(scripts_deadline, (start_date::date + interval '10 days')::date)
where onboarding_deadline is null
  and start_date is not null;
