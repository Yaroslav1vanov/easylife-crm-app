-- Фикс: у calendar_targets оказался включён RLS без политик — запись падала с 42501.
-- Ставим тот же паттерн доступа, что у reference_videos.
alter table public.calendar_targets enable row level security;
drop policy if exists "ct all read"   on public.calendar_targets;
drop policy if exists "ct all insert" on public.calendar_targets;
drop policy if exists "ct all update" on public.calendar_targets;
drop policy if exists "ct all delete" on public.calendar_targets;
create policy "ct all read"   on public.calendar_targets for select using (true);
create policy "ct all insert" on public.calendar_targets for insert with check (true);
create policy "ct all update" on public.calendar_targets for update using (true) with check (true);
create policy "ct all delete" on public.calendar_targets for delete using (true);
grant all on table public.calendar_targets to anon, authenticated, service_role;
