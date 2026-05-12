-- Migration: client_months
-- Per-client per-contractual-month tracking.
-- Replaces the earlier (unused) monthly_plans approach.
-- Apply once in Supabase Dashboard → SQL Editor → New query → Run.

-- Clean up unused prior table if it was attempted earlier.
DROP TABLE IF EXISTS public.monthly_plans CASCADE;

CREATE TABLE IF NOT EXISTS public.client_months (
  id            SERIAL PRIMARY KEY,
  client_id     INT  NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  month_number  INT  NOT NULL,                         -- 1, 2, 3 ... (matches scripts.month_number)
  start_date    DATE NOT NULL,                         -- when this contractual month opens
  end_date      DATE NOT NULL,                         -- contractual deadline
  package       INT  NOT NULL,                         -- target video count for this month
  status        TEXT NOT NULL DEFAULT 'active',        -- 'active' | 'closed' | 'cancelled'
  closed_at     DATE NULL,                             -- when actually marked closed
  note          TEXT,                                  -- free-form badge / comment
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, month_number)
);

CREATE INDEX IF NOT EXISTS idx_client_months_client   ON public.client_months (client_id);
CREATE INDEX IF NOT EXISTS idx_client_months_status   ON public.client_months (status);
CREATE INDEX IF NOT EXISTS idx_client_months_period   ON public.client_months (start_date, end_date);

-- Same access pattern as other tables (RLS off, full grant to anon+authenticated)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.client_months TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.client_months_id_seq TO anon, authenticated;

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS client_months_touch ON public.client_months;
CREATE TRIGGER client_months_touch
BEFORE UPDATE ON public.client_months
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
