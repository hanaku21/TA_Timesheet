-- =====================================================================
--  CAMT TA Timesheet — Database schema (PostgreSQL / Supabase)
--  Run this FIRST in the Supabase SQL editor, then run seed.sql
-- =====================================================================

-- Clean start (safe to re-run). Comment out if you want to keep data.
DROP TABLE IF EXISTS timesheet_entries CASCADE;
DROP TABLE IF EXISTS blackout_curricula CASCADE;
DROP TABLE IF EXISTS blackout_periods CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS sections CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS curricula CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS terms CASCADE;

-- ---------------------------------------------------------------------
-- Terms (academic years / semesters). code e.g. '2569/1'
-- Admin creates a new term, makes it active, then imports data into it.
-- ---------------------------------------------------------------------
CREATE TABLE terms (
  id          SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT,
  start_date  DATE,
  end_date    DATE,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Curricula (หลักสูตร): ANI, DF, DG, DII, MMIT, SE (Bachelor)
-- ---------------------------------------------------------------------
CREATE TABLE curricula (
  id     SERIAL PRIMARY KEY,
  code   TEXT NOT NULL UNIQUE,
  name   TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- Users (ผู้ช่วยสอน + admin)
--   employment_type: TOR (จ้างเหมา) | SCHOLARSHIP (ทุนป.ตรี) | TA_RA
--   login = email + password (password seeded = student_id or TOR number)
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  title           TEXT,
  full_name       TEXT NOT NULL,
  employment_type TEXT NOT NULL CHECK (employment_type IN ('TOR','SCHOLARSHIP','TA_RA')),
  report_status   TEXT,
  student_id      TEXT,
  phone           TEXT,
  email           TEXT NOT NULL UNIQUE,
  tor_number      TEXT,
  bank            TEXT,
  account_no      TEXT,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  active          BOOLEAN NOT NULL DEFAULT true,   -- inactive users cannot log in
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Courses (วิชา)
-- ---------------------------------------------------------------------
CREATE TABLE courses (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  curriculum_id INTEGER REFERENCES curricula(id)
);

-- ---------------------------------------------------------------------
-- Sections (ตอน) — a teaching slot of a course
-- ---------------------------------------------------------------------
CREATE TABLE sections (
  id              SERIAL PRIMARY KEY,
  course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section         TEXT NOT NULL,
  curriculum_id   INTEGER REFERENCES curricula(id),
  employment_type TEXT,
  tor_number      TEXT,
  teaching_type   TEXT,                 -- LEC | LAB
  teaching_days   JSONB DEFAULT '[]',   -- e.g. ["Mon","Thu"]
  start_time      TEXT,
  end_time        TEXT,
  instructor      TEXT,
  expected_cost   NUMERIC,
  rate            TEXT,
  semester        TEXT NOT NULL DEFAULT '2569/1',
  -- one row per (course, section, semester, teaching_type) so re-import upserts
  -- instead of duplicating. teaching_type is part of the key because a section
  -- can have both a LEC and a LAB row (same ตอน, different time).
  UNIQUE (course_id, section, semester, teaching_type)
);
CREATE INDEX idx_sections_course ON sections(course_id);

-- ---------------------------------------------------------------------
-- Assignments — which TA works which section (drives timesheet options)
-- ---------------------------------------------------------------------
CREATE TABLE assignments (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id  INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  start_date  DATE,
  end_date    DATE,
  semester    TEXT NOT NULL DEFAULT '2569/1',
  -- one TA per section per semester (assigning a new TA replaces the current one)
  UNIQUE (section_id, semester)
);
CREATE INDEX idx_assign_user ON assignments(user_id);

-- ---------------------------------------------------------------------
-- Blackout periods — date ranges admin disables for time logging
--   Linked to specific curricula via blackout_curricula.
--   A blackout with NO curriculum rows applies to ALL curricula.
-- ---------------------------------------------------------------------
CREATE TABLE blackout_periods (
  id          SERIAL PRIMARY KEY,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  reason      TEXT,
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TABLE blackout_curricula (
  blackout_id   INTEGER NOT NULL REFERENCES blackout_periods(id) ON DELETE CASCADE,
  curriculum_id INTEGER NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  PRIMARY KEY (blackout_id, curriculum_id)
);

-- ---------------------------------------------------------------------
-- Timesheet entries — one row per (user, section, work_date)
-- ---------------------------------------------------------------------
CREATE TABLE timesheet_entries (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id  INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  work_date   DATE NOT NULL,
  remark      TEXT,
  hours       NUMERIC,          -- manual hours for MODULE sections (null = derive from section time)
  semester    TEXT NOT NULL DEFAULT '2569/1',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, section_id, work_date)
);
CREATE INDEX idx_ts_user_date ON timesheet_entries(user_id, work_date);
CREATE INDEX idx_ts_date ON timesheet_entries(work_date);

-- ---------------------------------------------------------------------
-- Settings — key/value (semester dates, etc.)
-- ---------------------------------------------------------------------
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Keep sequences ahead of explicitly inserted ids after seeding
-- (handled at end of seed.sql).
