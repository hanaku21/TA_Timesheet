-- =====================================================================
--  006_tor_periods.sql
--  Per-TOR contract window: a section whose tor_number matches limits its
--  timesheet to [start_date, end_date]. Imported from the TOR CSV per term.
--  Safe to re-run.
-- =====================================================================

CREATE TABLE IF NOT EXISTS tor_periods (
  id            SERIAL PRIMARY KEY,
  tor_number    TEXT NOT NULL,
  term          TEXT NOT NULL,
  start_date    DATE,
  end_date      DATE,
  duration_days INTEGER,
  amount        NUMERIC,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tor_number, term)
);

CREATE INDEX IF NOT EXISTS idx_tor_periods_term ON tor_periods(term);
CREATE INDEX IF NOT EXISTS idx_tor_periods_number ON tor_periods(tor_number);
