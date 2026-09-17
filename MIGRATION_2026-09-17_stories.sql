-- Сторис как отдельный тип публикации (рядом с reel и carousel).
-- Кадр сторис = одна картинка или видео в media_urls[1]; заметка для команды — base_text.
-- В план роликов (scripts) сторис не попадают: не влияют на пакет, темп и ЗП.
alter table public.publications drop constraint if exists publications_content_type_check;
alter table public.publications
  add constraint publications_content_type_check check (content_type in ('reel', 'carousel', 'story'));
