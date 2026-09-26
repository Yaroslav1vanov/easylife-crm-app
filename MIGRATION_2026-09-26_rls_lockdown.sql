-- ============================================================
-- Закрываем базу от посторонних.
--
-- Было: публичный ключ CRM (он лежит в коде сайта, его видно любому)
-- давал читать И удалять данные во всех рабочих таблицах.
-- Стало: без входа в CRM — ничего. Вошедший сотрудник работает как раньше.
-- Фоновые задачи и телеграм-бот ходят под служебным ключом, правила его не касаются.
--
-- Особые политики (стратегия — только владелец и ассистент, настройки) не трогаем:
-- удаляются ТОЛЬКО политики вида «всем и всё можно».
-- Откат — в самом низу файла.
-- ============================================================

-- 1) Роль анонимного посетителя лишаем прав на таблицы целиком
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- 2) Включаем построчную защиту на всех таблицах
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- 3) Удаляем «открытые всем» политики (без условий, для public/anon).
--    Политики с условиями (is_owner(), is_strategy_member() и т.п.) остаются.
do $$
declare r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and coalesce(qual, 'true') = 'true'
      and coalesce(with_check, 'true') = 'true'
      and roles::text[] && array['public', 'anon']
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 4) Где после уборки не осталось ни одной политики — даём доступ вошедшим сотрудникам
do $$
declare r record;
begin
  for r in
    select t.tablename
    from pg_tables t
    where t.schemaname = 'public'
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = t.tablename
      )
  loop
    execute format(
      'create policy crm_authenticated on public.%I for all to authenticated using (true) with check (true)',
      r.tablename);
  end loop;
end $$;

-- 5) Что получилось: по каждой таблице видно, кому и что разрешено
select tablename,
       policyname,
       roles::text as "кому",
       coalesce(qual, 'без условий') as "условие чтения"
from pg_policies
where schemaname = 'public'
order by tablename, policyname;


-- ============================================================
-- ОТКАТ (если вдруг что-то отвалилось — выполнить это и написать мне):
--
-- do $$
-- declare r record;
-- begin
--   for r in select tablename from pg_tables where schemaname='public' loop
--     execute format('alter table public.%I disable row level security', r.tablename);
--   end loop;
-- end $$;
-- grant all privileges on all tables in schema public to anon;
-- grant all privileges on all sequences in schema public to anon;
-- ============================================================
