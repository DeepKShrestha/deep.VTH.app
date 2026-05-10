CREATE TABLE IF NOT EXISTS case_attachments (
  id SERIAL PRIMARY KEY,
  case_id INTEGER,
  temp_token TEXT,
  section_key TEXT NOT NULL DEFAULT 'treatment',
  category TEXT NOT NULL DEFAULT 'diagnostic',
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS case_attachments_case_id_idx ON case_attachments(case_id);
CREATE INDEX IF NOT EXISTS case_attachments_temp_token_idx ON case_attachments(temp_token);
