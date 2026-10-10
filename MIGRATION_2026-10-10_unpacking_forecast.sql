-- Распаковка клиента и прогноз-стратегия во вкладке «Стратегия».
-- unpacking — анкета тимлида (поля в data, текст в body); forecast — прогноз от ИИ:
-- file_key = forecast.html, data = forecast.json + pdf_key, status = draft | reviewed | approved.
alter table public.client_documents drop constraint if exists client_documents_kind_check;
alter table public.client_documents add constraint client_documents_kind_check
  check (kind in ('audit','strategy','content_plan','brief','other','unpacking','forecast'));
alter table public.client_documents add column if not exists data jsonb;
alter table public.client_documents add column if not exists status text;
select conname from pg_constraint where conrelid = 'public.client_documents'::regclass and contype = 'c';
