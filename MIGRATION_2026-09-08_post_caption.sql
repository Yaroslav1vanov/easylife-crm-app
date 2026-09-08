-- Описание к рилсу прямо в карточке сценария: тимлид пишет его вместе со сценарием,
-- в «Публикации» оно уезжает как основа текста поста.
alter table public.scripts add column if not exists post_caption text;
