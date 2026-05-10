CREATE TABLE IF NOT EXISTS backup_history (
  id SERIAL PRIMARY KEY,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  remote_key TEXT,
  db_provider TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS backup_history_created_at_idx ON backup_history(created_at DESC);

CREATE TABLE IF NOT EXISTS backup_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO backup_settings (key, value) VALUES ('auto_backup_enabled', 'false')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO backup_settings (key, value) VALUES ('auto_interval_hours', '24')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO backup_settings (key, value) VALUES ('retention_count', '7')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO backup_settings (key, value) VALUES ('remote_upload_enabled', 'false')
  ON CONFLICT (key) DO NOTHING;
