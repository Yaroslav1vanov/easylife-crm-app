-- ============================================================
-- ПОЧИНКА после закрытия базы (версия 2 — можно запускать повторно).
--
-- Что случилось: у profiles политики заведены по отдельности на каждое действие.
-- Скрипт закрытия удалил открытую политику на ЧТЕНИЕ, а новую не создал, потому
-- что другие политики на таблице остались. CRM не смогла прочитать роль владельца
-- и подставила запасной вариант «монтажёр» — отсюда урезанное меню.
--
-- Здесь: снимаем со всех задействованных таблиц одноимённые политики (чтобы
-- скрипт можно было гонять сколько угодно раз) и выставляем правила заново.
-- ============================================================

-- 1) Роли сотрудников: читают все вошедшие — иначе CRM не знает, кто зашёл.
--    Менять роли может только владелец, чтобы сотрудник не выдал себе его права.
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles' loop
    execute format('drop policy %I on public.profiles', pol.policyname);
  end loop;
end $$;
create policy profiles_read   on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (public.is_owner());
create policy profiles_update on public.profiles for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy profiles_delete on public.profiles for delete to authenticated using (public.is_owner());

-- 2) Зарплатные правки — только владелец (раздел «ЗП команды» и так его).
do $$
declare pol record;
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'payroll_adjustments') then
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'payroll_adjustments' loop
      execute format('drop policy %I on public.payroll_adjustments', pol.policyname);
    end loop;
    execute 'create policy payroll_owner on public.payroll_adjustments for all to authenticated using (public.is_owner()) with check (public.is_owner())';
  end if;
end $$;

-- 3) Остальные рабочие таблицы: если для какого-то действия политики нет —
--    добавляем её для вошедших сотрудников. Таблицы с особыми правилами
--    (стратегия, настройки, роли, зарплаты) не трогаем.
do $$
declare
  t record;
  c text;
  pname text;
  skip text[] := array['profiles', 'payroll_adjustments', 'app_settings',
                       'strategy_tasks', 'strategy_journal', 'strategy_sprints'];
begin
  for t in select tablename from pg_tables where schemaname = 'public' and not (tablename = any(skip)) loop
    foreach c in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      pname := 'crm_auth_' || lower(c);
      if not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = t.tablename
          and (p.cmd = c or p.cmd = 'ALL')
          and p.policyname <> pname
      ) then
        execute format('drop policy if exists %I on public.%I', pname, t.tablename);
        execute format('create policy %I on public.%I for %s to authenticated %s',
          pname, t.tablename, c,
          case c
            when 'INSERT' then 'with check (true)'
            when 'UPDATE' then 'using (true) with check (true)'
            else 'using (true)'
          end);
      end if;
    end loop;
  end loop;
end $$;

-- 4) Проверка. В списке должны остаться только стратегия, настройки и зарплаты.
select t.tablename as "таблица без чтения для сотрудников"
from pg_tables t
where t.schemaname = 'public'
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = t.tablename
      and p.cmd in ('SELECT', 'ALL')
      and p.roles::text[] && array['authenticated', 'public']
  )
order by 1;
