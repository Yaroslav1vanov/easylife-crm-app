-- ============================================================
-- ТЗ «аватары HeyGen в CRM», п. 8 (пилот) + хранилище из п. 2.
--
-- 1) clients.is_internal — своя карточка агентства: работает как обычный клиент
--    (сценарии, монтаж, чат, публикации), но не идёт в ЗП, план/факт, нагрузку
--    команды, счёт клиентов и статистику агентства. Первая — «Ярослав — личный блог» (31).
-- 2) client_avatars — какой аватар HeyGen закреплён за клиентом: группа, разрешённые
--    луки, голос, движок, месячный лимит видео. Исполнитель генерирует ТОЛЬКО из этого
--    списка (проверка кодом на сервере, п. 3). Менять может только владелец.
-- ============================================================

alter table public.clients add column if not exists is_internal boolean not null default false;
update public.clients set is_internal = true, niche = 'Ярослав — личный блог (внутренний проект)' where id = 31;

create table if not exists public.client_avatars (
  client_id        bigint primary key references public.clients(id) on delete restrict,
  heygen_group_id  text not null,
  look_ids         text[] not null default '{}',        -- разрешённые луки (3–5)
  default_look_id  text,
  look_names       jsonb not null default '{}'::jsonb,  -- {look_id: "название"} для подписи в интерфейсе
  voice_id         text,
  voice_model      text not null default 'eleven_v4',
  engine           text not null default 'avatar_v' check (engine in ('avatar_iii', 'avatar_iv', 'avatar_v', 'avatar_vi')),
  aspect           text not null default '9:16',
  resolution       text not null default '1080p',
  monthly_limit    int,                                 -- видео в месяц; null = по пакету (30 → 40, 20 → 28)
  updated_at       timestamptz not null default now(),
  updated_by       uuid,
  check (default_look_id is null or default_look_id = any(look_ids))
);

alter table public.client_avatars enable row level security;
drop policy if exists avatars_read on public.client_avatars;
drop policy if exists avatars_owner_write on public.client_avatars;
create policy avatars_read on public.client_avatars for select to authenticated using (true);
create policy avatars_owner_write on public.client_avatars for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on public.client_avatars to authenticated;   -- писать пустит только политика владельца
grant select, insert, update, delete on public.client_avatars to service_role;

-- Пилот: аватар Ярослава
insert into public.client_avatars (client_id, heygen_group_id, look_ids, default_look_id, look_names, voice_id, voice_model, engine, monthly_limit)
values (31, '733c2aedebf84354886e226111ba6354',
        array['bc2719178c90484a81455e35c12dcc85', 'b61035094175479eafbf09d2600ce7e9'],
        'bc2719178c90484a81455e35c12dcc85',
        '{"bc2719178c90484a81455e35c12dcc85": "Ярослав Иванов — 72", "b61035094175479eafbf09d2600ce7e9": "Ярослав спокойный"}'::jsonb,
        '648ff327e88a45e89d923254ddfa5991', 'eleven_v4', 'avatar_v', 40)
on conflict (client_id) do nothing;

-- Проверка
select c.id, c.name, c.is_internal, c.niche, a.engine, a.voice_model, array_length(a.look_ids, 1) as "луков", a.monthly_limit
from public.clients c left join public.client_avatars a on a.client_id = c.id where c.id = 31;
