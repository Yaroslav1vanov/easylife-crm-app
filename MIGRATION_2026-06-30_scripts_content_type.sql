-- ============================================================================
-- Тип контента у сценария/слота: reel (рилз) | carousel (карусель).
-- Нужно, чтобы в плане публикаций отмечать, что за единица запланирована.
-- Идемпотентно. Прогонять в Supabase SQL Editor.
-- ============================================================================

alter table public.scripts
  add column if not exists content_type text not null default 'reel'
    check (content_type in ('reel', 'carousel'));
