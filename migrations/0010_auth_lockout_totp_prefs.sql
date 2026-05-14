ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users ADD COLUMN locked_until TEXT;

ALTER TABLE users ADD COLUMN totp_secret TEXT;

ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS pending_two_factor_login (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS pending_two_factor_login_expires_idx
  ON pending_two_factor_login(expires_at);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  ast_toggle_defaults_json TEXT,
  hospital_toggle_defaults_json TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
