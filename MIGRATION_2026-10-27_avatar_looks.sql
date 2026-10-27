-- Образы группы HeyGen с картинками (кнопка «Обновить образы из HeyGen» в «Настройках» → «Аватар HeyGen»).
-- Картинки исполнитель копирует в наше хранилище; здесь — список: id, название, тип, ключ картинки.
alter table public.client_avatars add column if not exists group_looks jsonb not null default '[]'::jsonb;
alter table public.client_avatars add column if not exists looks_synced_at timestamptz;
select client_id, jsonb_array_length(group_looks) as "образов", looks_synced_at from public.client_avatars;
