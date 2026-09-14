-- Split carousels/photos from videos in monthly stats.
-- posts_count / views / likes ... = videos only (reels, TikTok, Shorts).
-- Carousels and photo posts are a different content type and are stored separately.
alter table public.client_monthly_stats add column if not exists carousels_count int;
alter table public.client_monthly_stats add column if not exists carousel_views  bigint;
-- Videos we published for the client that month, counted from CRM scripts.
alter table public.client_monthly_stats add column if not exists our_videos      int;
