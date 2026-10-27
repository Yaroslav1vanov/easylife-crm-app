-- ============================================================
-- Страховка переписки в чатах клиента (ТЗ «аватары HeyGen», п. 6).
--
-- Было: политика «for all using (true)» + grant update, delete сотрудникам —
-- кнопки удаления нет, но любой вошедший мог удалить или переписать сообщение
-- через API. Удаление клиента сносило всю переписку (on delete cascade).
--
-- Стало:
--  * сотрудник может только читать и писать СВОИ новые сообщения (от своего имени,
--    не от ИИ); править и удалять — нельзя никому, кроме служебного ключа;
--  * «скрыть» вместо удаления: hidden_at/hidden_by, только владелец (функция
--    hide_chat_message); скрытое видит только владелец, с пометкой; ИИ его не видит;
--  * журнал client_chat_audit: любая правка текста/вложений/скрытия и любое
--    удаление (даже служебным ключом) сохраняет старую версию, кто и когда;
--  * клиента с перепиской удалить нельзя (restrict) — переводить в «Ушёл».
-- Статусы задач ИИ (ai_status и т.п.) исполнитель меняет служебным ключом — это
-- в журнал не пишется, чтобы он не забивался.
-- ============================================================

-- 1. Скрытие вместо удаления
alter table public.client_chat_messages add column if not exists hidden_at timestamptz;
alter table public.client_chat_messages add column if not exists hidden_by uuid;

-- 2. Журнал правок и удалений
create table if not exists public.client_chat_audit (
  id          bigserial primary key,
  message_id  bigint not null,               -- без внешнего ключа: запись живёт и после удаления сообщения
  client_id   bigint,
  op          text not null check (op in ('update', 'delete', 'hide', 'unhide')),
  old_row     jsonb not null,                -- сообщение целиком ДО изменения
  new_body    text,                          -- текст после правки (для update)
  changed_by  uuid,                          -- кто (auth.uid(); null = служебный ключ / сервер)
  db_role     text,                          -- authenticated / service_role / postgres
  changed_at  timestamptz not null default now()
);
create index if not exists client_chat_audit_msg_idx on public.client_chat_audit (message_id);
create index if not exists client_chat_audit_client_idx on public.client_chat_audit (client_id, id);

create or replace function public.client_chat_audit_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  kind text;
begin
  if tg_op = 'DELETE' then
    insert into client_chat_audit (message_id, client_id, op, old_row, changed_by, db_role)
    values (old.id, old.client_id, 'delete', to_jsonb(old), auth.uid(), current_user);
    return old;
  end if;
  -- служебные поля (статус задачи ИИ, метрики, привязки) не журналируем
  if new.body is distinct from old.body or new.attachments is distinct from old.attachments
     or new.author_type is distinct from old.author_type or new.author_id is distinct from old.author_id
     or new.author_name is distinct from old.author_name or new.client_id is distinct from old.client_id
     or new.thread is distinct from old.thread or new.created_at is distinct from old.created_at then
    kind := 'update';
  elsif new.hidden_at is distinct from old.hidden_at then
    kind := case when new.hidden_at is null then 'unhide' else 'hide' end;
  else
    return new;
  end if;
  insert into client_chat_audit (message_id, client_id, op, old_row, new_body, changed_by, db_role)
  values (old.id, old.client_id, kind, to_jsonb(old), case when kind = 'update' then new.body end, auth.uid(), current_user);
  return new;
end $$;

drop trigger if exists client_chat_audit_upd on public.client_chat_messages;
create trigger client_chat_audit_upd before update on public.client_chat_messages
  for each row execute function public.client_chat_audit_trg();
drop trigger if exists client_chat_audit_del on public.client_chat_messages;
create trigger client_chat_audit_del before delete on public.client_chat_messages
  for each row execute function public.client_chat_audit_trg();

-- 3. Права сотрудников: читать (скрытое — только владелец) и писать свои новые
drop policy if exists crm_authenticated on public.client_chat_messages;
drop policy if exists chat_read on public.client_chat_messages;
drop policy if exists chat_write_own on public.client_chat_messages;
create policy chat_read on public.client_chat_messages
  for select to authenticated using (hidden_at is null or public.is_owner());
create policy chat_write_own on public.client_chat_messages
  for insert to authenticated
  with check (author_type = 'user' and (author_id is null or author_id = auth.uid()) and hidden_at is null and hidden_by is null);
revoke update, delete, truncate on public.client_chat_messages from authenticated, anon;
grant select, insert on public.client_chat_messages to authenticated;
grant select, insert, update, delete on public.client_chat_messages to service_role;

alter table public.client_chat_audit enable row level security;
drop policy if exists audit_owner_read on public.client_chat_audit;
create policy audit_owner_read on public.client_chat_audit for select to authenticated using (public.is_owner());
revoke all on public.client_chat_audit from authenticated, anon;
grant select on public.client_chat_audit to authenticated;
grant select, insert on public.client_chat_audit to service_role;
revoke update, delete, truncate on public.client_chat_audit from service_role;   -- журнал не правится и служебным ключом
grant usage, select on sequence public.client_chat_audit_id_seq to service_role;

-- 4. Скрыть / вернуть — только владелец (owner/admin)
create or replace function public.hide_chat_message(p_id bigint, p_hide boolean default true) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Скрывать сообщения может только владелец'; end if;
  update client_chat_messages
     set hidden_at = case when p_hide then now() else null end,
         hidden_by = case when p_hide then auth.uid() else null end
   where id = p_id;
  return found;
end $$;
revoke all on function public.hide_chat_message(bigint, boolean) from public, anon;
grant execute on function public.hide_chat_message(bigint, boolean) to authenticated;

-- 5. Удаление клиента больше не сносит переписку: с перепиской — только архив («Ушёл»)
alter table public.client_chat_messages drop constraint if exists client_chat_messages_client_id_fkey;
alter table public.client_chat_messages add constraint client_chat_messages_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete restrict;

-- Проверка
select has_table_privilege('authenticated', 'public.client_chat_messages', 'UPDATE') as "сотрудник правит (должно быть false)",
       has_table_privilege('authenticated', 'public.client_chat_messages', 'DELETE') as "сотрудник удаляет (false)",
       has_table_privilege('authenticated', 'public.client_chat_messages', 'INSERT') as "сотрудник пишет (true)",
       has_table_privilege('service_role',  'public.client_chat_messages', 'UPDATE') as "исполнитель (true)",
       (select confdeltype from pg_constraint where conname = 'client_chat_messages_client_id_fkey') as "r = restrict";
