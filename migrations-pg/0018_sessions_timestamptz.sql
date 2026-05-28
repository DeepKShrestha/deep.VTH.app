-- Sessions were created with TEXT timestamps (SQLite parity). All three must be
-- TIMESTAMPTZ so INSERT ... ($3 for created_at and last_seen_at) and expires_at > NOW() work.
ALTER TABLE sessions
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamptz;

ALTER TABLE sessions
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at::timestamptz;

ALTER TABLE sessions
  ALTER COLUMN last_seen_at TYPE TIMESTAMPTZ USING last_seen_at::timestamptz;
