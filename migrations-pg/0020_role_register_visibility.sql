-- Per-role admin toggles for "can register a new case" in each module.
-- See migrations/0020_role_register_visibility.sql for the full rationale
-- and the nullable-column trick that lets a missing/NULL value mean
-- "inherit capability". This is the Postgres twin; both must stay in sync.
ALTER TABLE role_feature_visibility
  ADD COLUMN IF NOT EXISTS ast_register_visible INTEGER;

ALTER TABLE role_feature_visibility
  ADD COLUMN IF NOT EXISTS hospital_register_visible INTEGER;

CREATE TABLE IF NOT EXISTS student_batch_feature_visibility (
  scope TEXT NOT NULL,
  batch INTEGER NOT NULL,
  register_visible INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, batch)
);
