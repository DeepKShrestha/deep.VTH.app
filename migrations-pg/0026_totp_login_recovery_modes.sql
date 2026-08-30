ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_login_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery_enabled BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users
SET
  totp_recovery_enabled = TRUE,
  totp_login_enabled = (role IN ('admin', 'superadmin'))
WHERE totp_enabled = TRUE AND totp_secret IS NOT NULL;
