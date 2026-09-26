-- ============================================================
-- Настройки и команда — кто что может.
--
-- Настройки (модели ИИ, промпты адаптации): читают все вошедшие, потому что
-- эти значения нужны CRM при генерации текстов у любого сотрудника.
-- МЕНЯЕТ — только владелец и ассистент.
--
-- Команда: тимлид видит состав, но ничего в нём не меняет.
-- Добавлять людей, править и выдавать доступы — владелец и ассистент.
--
-- is_strategy_member() = владелец, админ, ассистент (функция уже есть в базе).
-- Скрипт можно запускать повторно.
-- ============================================================

-- 1) Настройки
do $$
declare pol record;
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'app_settings') then
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'app_settings' loop
      execute format('drop policy %I on public.app_settings', pol.policyname);
    end loop;
    execute 'create policy settings_read   on public.app_settings for select to authenticated using (true)';
    execute 'create policy settings_insert on public.app_settings for insert to authenticated with check (public.is_strategy_member())';
    execute 'create policy settings_update on public.app_settings for update to authenticated using (public.is_strategy_member()) with check (public.is_strategy_member())';
    execute 'create policy settings_delete on public.app_settings for delete to authenticated using (public.is_strategy_member())';
  end if;
end $$;

-- 2) Команда
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'team_members' loop
    execute format('drop policy %I on public.team_members', pol.policyname);
  end loop;
  execute 'create policy team_read   on public.team_members for select to authenticated using (true)';
  execute 'create policy team_insert on public.team_members for insert to authenticated with check (public.is_strategy_member())';
  execute 'create policy team_update on public.team_members for update to authenticated using (public.is_strategy_member()) with check (public.is_strategy_member())';
  execute 'create policy team_delete on public.team_members for delete to authenticated using (public.is_strategy_member())';
end $$;

-- 3) Что получилось
select tablename as "таблица", policyname as "политика", cmd as "действие",
       coalesce(qual, with_check, 'всем вошедшим') as "условие"
from pg_policies
where schemaname = 'public' and tablename in ('app_settings', 'team_members')
order by tablename, cmd;
