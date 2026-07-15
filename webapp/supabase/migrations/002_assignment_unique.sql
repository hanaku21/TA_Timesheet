-- Migration: ensure the "one TA per section per semester" unique constraint
-- exists on the assignments table. Databases created from an older schema
-- may be missing it, which breaks ON CONFLICT (section_id, semester) upserts
-- used by the CSV import ("there is no unique or exclusion constraint
-- matching the ON CONFLICT specification").
--
-- Safe to run multiple times.

DO $$
BEGIN
  -- Remove duplicate assignments (keep the lowest id) so the unique index can be created.
  DELETE FROM assignments a
  USING assignments b
  WHERE a.section_id = b.section_id
    AND a.semester   = b.semester
    AND a.id > b.id;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'assignments'::regclass
      AND contype  = 'u'
      AND conname  = 'assignments_section_id_semester_key'
  ) THEN
    ALTER TABLE assignments
      ADD CONSTRAINT assignments_section_id_semester_key
      UNIQUE (section_id, semester);
  END IF;
END $$;
