ALTER TABLE users ADD COLUMN totp_login_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_recovery_enabled INTEGER NOT NULL DEFAULT 0;

UPDATE users
SET
  totp_recovery_enabled = 1,
  totp_login_enabled = CASE WHEN role IN ('admin', 'superadmin') THEN 1 ELSE 0 END
WHERE totp_enabled = 1 AND totp_secret IS NOT NULL;
