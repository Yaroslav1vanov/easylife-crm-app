-- Дополнительные монтажёры на клиенте — ТОЛЬКО доступ/видимость.
-- Основной монтажёр (clients.montager_id) не меняется: именно по нему считается ЗП.
-- Доп. монтажёры видят клиента в разделе «Монтаж» (сценарии, референсы, сроки),
-- но в расчёт зарплаты не попадают.
-- Идемпотентно.

alter table public.clients
  add column if not exists extra_montager_ids integer[] default '{}'::integer[];

comment on column public.clients.extra_montager_ids is
  'ID сотрудников (team_members), которым открыт доступ к клиенту в Монтаже. На ЗП не влияет — она считается по montager_id.';
