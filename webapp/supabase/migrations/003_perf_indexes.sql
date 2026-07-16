-- Performance indexes for the common query paths. Safe to run multiple times.

-- Admin overview + exports: filter timesheet_entries by (semester, work_date range)
CREATE INDEX IF NOT EXISTS idx_ts_semester_date
  ON timesheet_entries (semester, work_date);

-- A TA's own timesheet: filter by (user_id, semester)
CREATE INDEX IF NOT EXISTS idx_ts_user_semester
  ON timesheet_entries (user_id, semester);

-- Assignments looked up per user within a term
CREATE INDEX IF NOT EXISTS idx_assign_user_semester
  ON assignments (user_id, semester);

-- Sections filtered/joined by curriculum and term
CREATE INDEX IF NOT EXISTS idx_sections_curriculum
  ON sections (curriculum_id);
CREATE INDEX IF NOT EXISTS idx_sections_semester
  ON sections (semester);
