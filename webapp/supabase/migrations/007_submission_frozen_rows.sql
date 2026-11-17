-- =====================================================================
--  007_submission_frozen_rows.sql
--  Freeze the exact document rows (dates/hours) at confirmation time for
--  ทุน ป.ตรี (SCHOLARSHIP), whose form dates are redistributed and would
--  otherwise change if other sections/config change later.
--  Safe to re-run.
-- =====================================================================

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS frozen_rows JSONB;
