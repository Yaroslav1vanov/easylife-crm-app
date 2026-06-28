-- Раздел «Референсы»: залётные чужие ролики под клиента (ссылка → транскрипт + статистика).
-- Идемпотентно. Прогнать в Supabase SQL Editor.

create table if not exists public.reference_videos (
  id            bigserial primary key,
  client_id     bigint not null references public.clients(id) on delete cascade,
  url           text not null,
  platform      text,                    -- tiktok / instagram / youtube
  author        text,
  caption       text,
  transcript    text,
  views         bigint,
  likes         bigint,
  comments      bigint,
  thumbnail_url text,
  note          text,                    -- почему залетел / что адаптируем
  fetched_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_refvideos_client on public.reference_videos (client_id, created_at desc);

alter table public.reference_videos enable row level security;
drop policy if exists "ref all read"   on public.reference_videos;
drop policy if exists "ref all insert" on public.reference_videos;
drop policy if exists "ref all update" on public.reference_videos;
drop policy if exists "ref all delete" on public.reference_videos;
create policy "ref all read"   on public.reference_videos for select using (true);
create policy "ref all insert" on public.reference_videos for insert with check (true);
create policy "ref all update" on public.reference_videos for update using (true) with check (true);
create policy "ref all delete" on public.reference_videos for delete using (true);

grant all privileges on table public.reference_videos to anon, authenticated, service_role;
grant all privileges on sequence public.reference_videos_id_seq to anon, authenticated, service_role;
