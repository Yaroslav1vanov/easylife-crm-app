-- ============================================================================
-- Карусели в пайплайне публикаций. Добавляет тип контента «carousel» рядом с
-- видео («reel») и массив картинок-слайдов. Карусель может существовать без
-- сценария (рендерится скиллом карусели), поэтому script_id делаем nullable.
-- Идемпотентно. Безопасно прогонять повторно в Supabase SQL Editor.
-- ============================================================================

-- 1) Тип контента: reel (видео, как сейчас) | carousel (набор картинок для IG) ----
alter table public.publications
  add column if not exists content_type text not null default 'reel'
    check (content_type in ('reel', 'carousel'));

-- 2) Слайды карусели — упорядоченный массив публичных URL картинок (R2) ----------
alter table public.publications
  add column if not exists media_urls text[] default '{}';

-- 3) Карусель не обязана быть привязана к видео-сценарию ------------------------
alter table public.publications
  alter column script_id drop not null;
-- unique по script_id остаётся: в Postgres NULL-значения не конфликтуют,
-- поэтому несколько каруселей без сценария спокойно сосуществуют.

create index if not exists idx_publications_content_type on public.publications (content_type);
