-- Per-section submission / freeze. A row = the user has confirmed submission for
-- that (term, month, section); that section's timesheet for the month is then
-- frozen (no edits) until an admin rejects it. Safe to run twice.

CREATE TABLE IF NOT EXISTS submissions (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id    INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  term          TEXT NOT NULL,
  month         TEXT NOT NULL,          -- 'YYYY-MM'
  confirmed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, term, month, section_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions (user_id, term);
