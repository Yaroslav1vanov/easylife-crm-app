-- Пробный рилс Instagram (Trial Reel) через Metricool: instagramData.type = TRIAL_REEL.
-- Сначала ролик видят только не-подписчики; ig_trial_share = Instagram сам покажет подписчикам, если зайдёт за 72 часа.
alter table public.publications add column if not exists ig_trial boolean not null default false;
alter table public.publications add column if not exists ig_trial_share boolean not null default true;
