-- Отдельные роли сотрудников: монтажёр, тимлид, менеджер по продажам, проджект, ассистент.
-- Роль выбирается в «Команда» → «Выдать доступ» и сразу задаёт, что человек видит, и его группу в «Команде».
-- Идемпотентно, данные не меняет.

-- 1. Роли доступа (profiles.role): добавляем project и sales
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'admin', 'assistant', 'project', 'teamlead', 'sales', 'montager', 'scriptwriter'));

-- 2. Группа в «Команде» (team_members.member_type): если на ней стоит проверка списка, снимаем и ставим новую
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.team_members'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%member_type%'
  loop
    execute format('alter table public.team_members drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.team_members add constraint team_members_member_type_check
  check (member_type in ('admin', 'assistant', 'project', 'teamlead', 'sales', 'montager')) not valid;   -- старые строки не проверяем

-- 3. Стратегия: проджект видит её так же, как ассистент
create or replace function public.is_strategy_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'admin', 'assistant', 'project'));
$$;

-- Проверка
select p.email, p.role, t.name, t.member_type
from public.profiles p left join public.team_members t on t.profile_id = p.id
order by p.role, p.email;
