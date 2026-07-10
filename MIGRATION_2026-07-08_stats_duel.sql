-- ============================================================================
-- «Дуэль» исходник ↔ наше видео: статистика рефа и нашего ролика на сценарии.
-- ref_*  — цифры исходника (копируются из референса при создании сценария,
--          обновляются по кнопке из ref_url через ScrapeCreators).
-- our_*  — цифры нашего опубликованного ролика (тянутся из video_url).
-- Идемпотентно. Прогонять в Supabase SQL Editor.
-- ============================================================================

alter table public.scripts
  add column if not exists ref_views    bigint,
  add column if not exists ref_likes    bigint,
  add column if not exists ref_comments bigint,
  add column if not exists our_views     bigint,
  add column if not exists our_likes     bigint,
  add column if not exists our_comments  bigint,
  add column if not exists our_stats_at  timestamptz;
