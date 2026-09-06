-- Настройки CRM в виде ключ → значение (первое применение: какая модель Claude пишет тексты).
create table if not exists public.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists "settings read" on public.app_settings;
drop policy if exists "settings write" on public.app_settings;
create policy "settings read"  on public.app_settings for select using (true);
create policy "settings write" on public.app_settings for all using (true) with check (true);
