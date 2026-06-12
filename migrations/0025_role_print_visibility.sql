-- Per-role admin toggles for "can print / download a case report" in each
-- module. Mirrors the existing ast_export_visible / hospital_export_visible
-- pattern exactly:
--
--   * Acts as an EXTRA gate on top of the role's case-view capability — it can
--     only *deny* the convenient print/PDF surfaces (the Print Report button,
--     the /print/:id route, and the GET /api/cases/:id/pdf endpoint) for a role.
--   * A missing row / NULL is treated as visible (1) so existing installations
--     keep today's behaviour (everyone who can view can print) until an admin
--     explicitly turns it off for a role.
--
-- NOTE: this cannot stop a user who can already VIEW a case from using the
-- browser's native print (Ctrl+P) or a screenshot — it only removes the
-- in-app print affordances. See SECURITY_NOTES.md.
--
-- DEFAULT 1 keeps the column NOT NULL and visible-by-default, matching the
-- export columns.
ALTER TABLE role_feature_visibility
  ADD COLUMN ast_print_visible INTEGER NOT NULL DEFAULT 1;

ALTER TABLE role_feature_visibility
  ADD COLUMN hospital_print_visible INTEGER NOT NULL DEFAULT 1;
