-- Метка Instagram «Сделано с помощью ИИ» (AI info) при публикации через Metricool: instagramData.isAiGenerated.
-- clients.ai_label — по умолчанию для всех публикаций клиента (аватар = да);
-- publications.ai_label — для конкретного ролика: null = как у клиента, true/false = вручную.
alter table public.clients add column if not exists ai_label boolean not null default false;
alter table public.publications add column if not exists ai_label boolean;
