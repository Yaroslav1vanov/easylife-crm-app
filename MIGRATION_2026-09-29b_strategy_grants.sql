-- Права сотрудников на таблицы вкладки «Стратегия».
-- Таблицы создали 28.09, но роли authenticated (вошедшие сотрудники) права не выдались:
-- вкладка ничего не читала и не сохраняла — «permission denied» даже у владельца.
-- RLS-политика crm_authenticated на этих таблицах уже есть, не хватало самих прав.

grant select, insert, update, delete on public.client_brand, public.client_documents, public.client_assets to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- чтобы следующие новые таблицы не наступили на то же
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- Проверка: по всем таблицам — есть ли у сотрудников право читать
select c.relname as "таблица",
       case when has_table_privilege('authenticated', c.oid, 'SELECT') then 'да' else 'НЕТ' end as "сотрудник читает"
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 2, 1;
