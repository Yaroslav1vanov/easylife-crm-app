-- Автопривязка вышедших роликов к сценариям (22.10.2026): ручная правка ссылки отключает автопривязку,
-- прежний статус видео — чтобы вернуть его, если автопривязанную ссылку сняли.
alter table public.scripts
  add column if not exists autolink_off boolean not null default false,
  add column if not exists autolink_prev_status text;
select 'ok' as result;
