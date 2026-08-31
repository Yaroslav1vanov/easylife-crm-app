-- Дни рождения клиентов и сотрудников — чтобы не пропускать поздравления.
alter table public.clients      add column if not exists birthday date;
alter table public.team_members add column if not exists birthday date;
