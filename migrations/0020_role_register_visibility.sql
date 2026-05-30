-- Per-role admin toggles for "can register a new case" in each module.
-- Mirrors the existing ast_export_visible / hospital_export_visible pattern
-- on role_feature_visibility but with one important difference:
--
-- Export toggles act as an EXTRA gate on top of capability — they can only
-- *deny* access that the capability matrix already grants. Register
-- toggles, by contrast, must be able to GRANT access too (students don't
-- have `ast.case.create` by default, but an admin needs to be able to turn
-- AST registration on for them). To make that work safely we model the
-- columns as nullable:
--
--   * NULL              → inherit the role's intrinsic capability (today's
--                          behaviour is preserved on first deploy)
--   * 0 (false)         → explicit deny (overrides capability)
--   * 1 (true)          → explicit allow (overrides capability)
--
-- SQLite doesn't enforce DEFAULT NULL on `ADD COLUMN INTEGER` (the column
-- is nullable by default), so leaving the type without `NOT NULL` is
-- enough. We rely on this everywhere the resolver runs — see
-- server/routes/context.ts `isAstRegisterVisibleForRole`.
ALTER TABLE role_feature_visibility
  ADD COLUMN ast_register_visible INTEGER;

ALTER TABLE role_feature_visibility
  ADD COLUMN hospital_register_visible INTEGER;

-- Per-batch override for students. The role toggle is the MASTER switch;
-- this table can only further restrict an allowed role. Semantics:
--
--   * No row for (scope, batch) → inherit the role decision (default).
--   * register_visible = 0      → block this specific batch.
--   * register_visible = 1      → no-op (same as inherit) — kept so the
--                                  admin can flip the toggle back on
--                                  without deleting rows.
--
-- We do NOT support "role off, specific batch on" — that would be too easy
-- to misconfigure and surprise users. Future-proof: newly enrolled batches
-- never need a row created for them; they inherit automatically.
CREATE TABLE IF NOT EXISTS student_batch_feature_visibility (
  scope TEXT NOT NULL,
  batch INTEGER NOT NULL,
  register_visible INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, batch)
);
