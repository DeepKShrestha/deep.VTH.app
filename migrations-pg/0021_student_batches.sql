-- Canonical list of valid student batch numbers, curated by an admin.
-- See migrations/0021_student_batches.sql for the design rationale. This
-- is the Postgres twin; both must stay in sync.
CREATE TABLE IF NOT EXISTS student_batches (
  batch INTEGER PRIMARY KEY,
  updated_at TEXT NOT NULL
);
