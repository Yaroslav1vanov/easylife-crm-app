-- ============================================================
-- ПРОВЕРКА ПЕРЕД тем, как ограничивать доступ к клиентам.
-- Ничего не меняет — только показывает, всё ли готово.
--
-- Доступ будет считаться так: аккаунт сотрудника (profiles) → его карточка
-- в «Команде» (team_members.profile_id) → клиенты, где он тимлид, монтажёр
-- или ему открыт доступ вручную. Если карточка с аккаунтом не связана,
-- сотрудник после включения не увидит НИ ОДНОГО клиента — поэтому сначала смотрим.
-- ============================================================

-- 1) Аккаунты в CRM и их связь с карточкой сотрудника
select p.email                                как_заходит,
       p.role                                 роль,
       coalesce(t.name, '— НЕТ КАРТОЧКИ В КОМАНДЕ —')  карточка_в_команде,
       t.member_type                          тип,
       case
         when p.role in ('owner', 'admin', 'assistant') then 'видит всех клиентов'
         when t.id is null then 'ПОСЛЕ ВКЛЮЧЕНИЯ НЕ УВИДИТ НИЧЕГО — нужно связать'
         else 'увидит своих'
       end                                    что_будет
from public.profiles p
left join public.team_members t on t.profile_id = p.id
order by (t.id is null) desc, p.role, p.email;

-- 2) Сколько клиентов закреплено за каждым сотрудником
select t.name                                                          сотрудник,
       t.member_type                                                   тип,
       (t.profile_id is not null)                                      есть_вход_в_crm,
       count(*) filter (where c.teamlead_id = t.id)                    как_тимлид,
       count(*) filter (where c.montager_id = t.id)                    как_монтажёр,
       count(*) filter (where t.id = any(c.extra_montager_ids))        доступ_открыт_вручную
from public.team_members t
left join public.clients c
  on c.teamlead_id = t.id or c.montager_id = t.id or t.id = any(c.extra_montager_ids)
group by t.id, t.name, t.member_type, t.profile_id
order by t.member_type, t.name;

-- 3) Клиенты без ответственных — их после включения не увидит никто, кроме владельца
select id, name, surname, stage
from public.clients
where teamlead_id is null and montager_id is null
order by stage, name;
