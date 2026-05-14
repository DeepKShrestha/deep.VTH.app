-- Super Admin can require TOTP for administrator accounts (see PATCH /api/admin/users/:id/totp-enforcement).
ALTER TABLE users ADD COLUMN totp_enforced INTEGER NOT NULL DEFAULT 0;
