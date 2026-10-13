-- Корзина сценариев (14.10.2026).
-- Зачем: 12.10 из календаря публикаций стёрли 24 опубликованных сценария клиента, вернуть было неоткуда.
-- Теперь любое удаление сценария (из любого раздела CRM, API или SQL) сначала кладёт копию строки в
-- scripts_trash вместе с его публикацией (publications удаляется каскадом). Пустые заглушки плана
-- (без текста, без референса и не взятые в работу) в корзину не попадают — их удаляют пачками штатно.
-- Восстановление: функция restore_script_from_trash(id) — возвращает сценарий с тем же id и публикацию.

create table if not exists public.scripts_trash (
  id          bigserial primary key,
  script_id   bigint not null,
  client_id   bigint,
  row         jsonb not null,
  pub         jsonb,
  deleted_at  timestamptz not null default now(),
  deleted_by  uuid,
  restored_at timestamptz
);
create index if not exists scripts_trash_client_idx on public.scripts_trash (client_id, deleted_at desc);
create index if not exists scripts_trash_script_idx on public.scripts_trash (script_id);

create or replace function public.scripts_to_trash() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pub jsonb;
begin
  if coalesce(btrim(old.hook_text), '') = '' and coalesce(btrim(old.body_text), '') = ''
     and coalesce(btrim(regexp_replace(coalesce(old.hook, ''), '^Сценарий #\d+$', '')), '') = ''
     and coalesce(btrim(old.ref_url), '') = ''
     and coalesce(old.script_status, 'notStarted') = 'notStarted'
     and coalesce(old.video_status, 'notStarted') = 'notStarted' then
    return old;
  end if;
  select to_jsonb(p) into v_pub from public.publications p where p.script_id = old.id limit 1;
  insert into public.scripts_trash (script_id, client_id, row, pub, deleted_by)
  values (old.id, old.client_id, to_jsonb(old), v_pub, auth.uid());
  return old;
end $$;

create or replace trigger scripts_to_trash before delete on public.scripts
  for each row execute function public.scripts_to_trash();

create or replace function public.restore_script_from_trash(p_trash_id bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare t public.scripts_trash%rowtype;
begin
  select * into t from public.scripts_trash where id = p_trash_id and restored_at is null for update;
  if not found then raise exception 'Нет в корзине или уже восстановлен'; end if;
  if exists (select 1 from public.scripts where id = t.script_id) then
    raise exception 'Сценарий % уже есть в CRM', t.script_id;
  end if;
  insert into public.scripts select * from jsonb_populate_record(null::public.scripts, t.row);
  if t.pub is not null and not exists (select 1 from public.publications where script_id = t.script_id) then
    insert into public.publications select * from jsonb_populate_record(null::public.publications, t.pub);
  end if;
  update public.scripts_trash set restored_at = now() where id = p_trash_id;
  return t.script_id;
end $$;

revoke all on function public.restore_script_from_trash(bigint) from public, anon, authenticated;
grant execute on function public.restore_script_from_trash(bigint) to service_role;

alter table public.scripts_trash enable row level security;
create policy crm_read on public.scripts_trash for select to authenticated using (true);
grant select on public.scripts_trash to authenticated;
grant all on public.scripts_trash to service_role;
grant usage, select on sequence public.scripts_trash_id_seq to service_role;

select 'ok' as result;
