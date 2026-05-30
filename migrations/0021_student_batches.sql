-- Canonical list of valid student batch numbers, curated by an admin.
--
-- Why a separate table from student_batch_feature_visibility:
--   * That table's "missing row = inherit role decision" semantic only
--     makes sense for the per-batch register override. Conflating
--     "exists" with "register-visibility override" would break that
--     inheritance and silently auto-enable any batch admins forgot to
--     toggle.
--   * Lookups during signup don't need scope (ast/hospital) — the batch
--     either exists at the university or it doesn't.
--
-- Seeded from the current users.student_batch values on first deploy so
-- existing users never get locked out by the new validation. After that
-- the admin maintains the list from Admin → Access Control.
CREATE TABLE IF NOT EXISTS student_batches (
  batch INTEGER PRIMARY KEY,
  updated_at TEXT NOT NULL
);
