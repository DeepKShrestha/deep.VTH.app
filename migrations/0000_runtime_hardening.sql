CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  requested_by_role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_by INTEGER,
  resolver_note TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS cases_created_at_idx ON cases(created_at);
CREATE INDEX IF NOT EXISTS cases_date_idx ON cases(date);
CREATE INDEX IF NOT EXISTS cases_case_number_idx ON cases(case_number);
CREATE INDEX IF NOT EXISTS password_reset_requests_user_id_idx
  ON password_reset_requests(user_id);
CREATE INDEX IF NOT EXISTS password_reset_requests_status_idx
  ON password_reset_requests(status);
CREATE INDEX IF NOT EXISTS download_requests_created_at_idx
  ON download_requests(created_at);
CREATE INDEX IF NOT EXISTS download_requests_user_id_idx
  ON download_requests(user_id);
