-- ============================================================
-- Кредиты HeyGen видит только владелец (просьба Ярослава 27.10).
-- Журнал генераций avatar_generations читает только владелец (owner/admin) — там кредиты.
-- Сотрудникам в чате «Аватар» нужны только счётчики за месяц (озвучки, видео из лимита,
-- переделки, ошибки) — отдаём их функцией avatar_usage без кредитов.
-- Сервер (служебный ключ) работает как раньше.
-- ============================================================

drop policy if exists gen_read on public.avatar_generations;
drop policy if exists gen_owner_read on public.avatar_generations;
create policy gen_owner_read on public.avatar_generations for select to authenticated using (public.is_owner());

create or replace function public.avatar_usage(p_client bigint)
returns table (voices int, videos int, redos int, errors int)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where kind = 'voice' and status <> 'error')::int,
         count(*) filter (where kind = 'video' and status <> 'error')::int,
         count(*) filter (where is_redo and status <> 'error')::int,
         count(*) filter (where status = 'error')::int
  from avatar_generations
  where client_id = p_client and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
$$;
revoke all on function public.avatar_usage(bigint) from public, anon;
grant execute on function public.avatar_usage(bigint) to authenticated;

-- Проверка
select (select count(*) from pg_policies where tablename = 'avatar_generations' and policyname = 'gen_owner_read') as "только владелец (1)",
       (select count(*) from pg_policies where tablename = 'avatar_generations' and policyname = 'gen_read') as "старый доступ всем (0)",
       * from public.avatar_usage(31);
