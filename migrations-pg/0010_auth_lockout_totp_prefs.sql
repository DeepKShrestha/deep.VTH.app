ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS pending_two_factor_login (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS pending_two_factor_login_expires_idx
  ON pending_two_factor_login(expires_at);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  locale TEXT NOT NULL DEFAULT 'en',
  ast_toggle_defaults_json TEXT,
  hospital_toggle_defaults_json TEXT,
  updated_at TIMESTAMPTZ NOT NULL
);
