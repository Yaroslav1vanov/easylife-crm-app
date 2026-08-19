-- Роль «assistant» — ассистент владельца: видит общую картину по ВСЕМ клиентам
-- (таблица, просрочки, темп) и работает с тимлидами, но раздел «ЗП команды» ему закрыт.
-- В profiles стоит CHECK на список ролей — расширяем его.
-- Идемпотентно.

alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'admin', 'assistant', 'teamlead', 'montager', 'scriptwriter'));
