-- Migration: monthly_plans (per-client per-calendar-month video plan)
-- Apply this once in Supabase Dashboard → SQL Editor → New query → Run.
-- Dashboard ("Главный дашборд") shows defaults from clients.package until this is applied;
-- saving an edited plan will fail without this table.

CREATE TABLE IF NOT EXISTS public.monthly_plans (
  id              SERIAL PRIMARY KEY,
  client_id       INT  NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  year_month      TEXT NOT NULL,                       -- format: 'YYYY-MM'
  planned_videos  INT  NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_plans_client     ON public.monthly_plans (client_id);
CREATE INDEX IF NOT EXISTS idx_monthly_plans_ym         ON public.monthly_plans (year_month);

-- Same access pattern as other tables (RLS off, full grant to anon+authenticated)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.monthly_plans TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.monthly_plans_id_seq TO anon, authenticated;

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS monthly_plans_touch ON public.monthly_plans;
CREATE TRIGGER monthly_plans_touch
BEFORE UPDATE ON public.monthly_plans
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
