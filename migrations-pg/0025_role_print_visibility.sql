-- Per-role admin toggles for "can print / download a case report" in each
-- module. Postgres twin of migrations/0025_role_print_visibility.sql — both
-- must stay in sync. See that file for the full rationale (EXTRA gate on top
-- of the case-view capability; missing/NULL means visible).
ALTER TABLE role_feature_visibility
  ADD COLUMN IF NOT EXISTS ast_print_visible INTEGER NOT NULL DEFAULT 1;

ALTER TABLE role_feature_visibility
  ADD COLUMN IF NOT EXISTS hospital_print_visible INTEGER NOT NULL DEFAULT 1;
