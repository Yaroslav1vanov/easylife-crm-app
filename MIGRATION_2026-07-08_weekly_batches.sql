-- ============================================================================
-- Недельные партии: клиенту сдаём видео пачкой раз в неделю.
-- delivery_day — день недели сдачи партии клиенту (1=Пн … 7=Вс).
-- weekly_quota — роликов в неделю (NULL = авто из пакета: 30/мес→7, 20/мес→5).
-- review_day   — день недели, когда тимлид сдаёт Ярославу рефы+сценарии на проверку.
-- Готовность партии = delivery_day − 3 дня (буфер на перемонтаж).
-- Идемпотентно. Прогонять в Supabase SQL Editor.
-- ============================================================================

alter table public.clients
  add column if not exists delivery_day smallint check (delivery_day between 1 and 7),
  add column if not exists weekly_quota smallint check (weekly_quota > 0),
  add column if not exists review_day smallint check (review_day between 1 and 7);
