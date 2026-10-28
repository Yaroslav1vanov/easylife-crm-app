-- ============================================================
-- Все видео HeyGen (и сделанные через CRM, и напрямую в вебе HeyGen) — для аналитики владельца:
-- сколько видео/минут/кредитов ушло на каждого клиента по месяцам.
-- Клиент определяется по образу (avatar_id ∈ client_avatars.group_looks), иначе по папке/названию,
-- нераспознанные Ярослав привязывает руками. Кредиты HeyGen за видео не отдаёт — считаем по
-- длительности и движку (замеры 27–28.10: Avatar VI ≈ 1,0 кр/с, Avatar V ≈ 0,83 кр/с).
-- Видит и правит только владелец. Только новая таблица.
-- ============================================================
create table if not exists public.heygen_videos (
  id           text primary key,              -- video_id HeyGen
  title        text,
  created_at   timestamptz not null,
  duration     numeric(8,2),                  -- секунды
  folder_id    text,
  avatar_ids   text[] not null default '{}',
  engine       text,                          -- avatar_vi / avatar_v / avatar_iv / avatar_iii
  voice_ids    text[] not null default '{}',
  client_id    bigint references public.clients(id) on delete set null,
  match        text check (match in ('avatar', 'folder', 'title', 'manual', 'crm')),
  source       text not null default 'web' check (source in ('web', 'crm')),
  credits_est  numeric(8,1),
  status       text,
  synced_at    timestamptz not null default now()
);
create index if not exists heygen_videos_client_idx on public.heygen_videos (client_id, created_at);
create index if not exists heygen_videos_created_idx on public.heygen_videos (created_at);

alter table public.heygen_videos enable row level security;
drop policy if exists hv_owner on public.heygen_videos;
create policy hv_owner on public.heygen_videos for all to authenticated using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on public.heygen_videos to authenticated;
grant select, insert, update, delete on public.heygen_videos to service_role;

select count(*) as "видео в таблице" from public.heygen_videos;
