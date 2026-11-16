-- Рекомендация к монтажу (ВАЖНО!) в карточке сценария: пишет тимлид, видит монтажёр и ИИ-монтаж
alter table public.scripts add column if not exists montage_note text;
