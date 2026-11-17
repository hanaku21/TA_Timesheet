-- Blackout (holiday) periods belong to one academic term.
-- Existing rows are attached to the term that is active when this runs.
ALTER TABLE blackout_periods ADD COLUMN IF NOT EXISTS term TEXT;
UPDATE blackout_periods SET term = (SELECT code FROM terms WHERE is_active = true LIMIT 1) WHERE term IS NULL;
CREATE INDEX IF NOT EXISTS blackout_periods_term_idx ON blackout_periods (term);
