ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at TEXT;
UPDATE sessions SET last_seen_at = created_at WHERE last_seen_at IS NULL;
