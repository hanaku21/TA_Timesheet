-- Upgrade the submissions table from per-month to per-section confirmation.
-- Run only if you already applied 004 (the old month-level version). Safe to run twice.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'section_id'
  ) THEN
    -- clear any old month-level rows so the NOT NULL column can be added
    DELETE FROM submissions;
    ALTER TABLE submissions
      ADD COLUMN section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE;
  END IF;

  -- drop the old (user, term, month) unique constraint if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'submissions_user_id_term_month_key'
  ) THEN
    ALTER TABLE submissions DROP CONSTRAINT submissions_user_id_term_month_key;
  END IF;

  -- add the new (user, term, month, section) unique constraint if missing
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'submissions_user_id_term_month_section_id_key'
  ) THEN
    ALTER TABLE submissions
      ADD CONSTRAINT submissions_user_id_term_month_section_id_key
      UNIQUE (user_id, term, month, section_id);
  END IF;
END $$;
