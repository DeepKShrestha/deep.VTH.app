-- Referential integrity for Postgres (SQLite uses triggers in 0016_foreign_keys.sql).

DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM download_requests WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM password_reset_requests WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM case_change_logs WHERE actor_user_id NOT IN (SELECT id FROM users);
DELETE FROM case_attachments
WHERE case_id IS NOT NULL AND case_id NOT IN (SELECT id FROM cases);

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;
ALTER TABLE sessions
  ADD CONSTRAINT sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE download_requests
  DROP CONSTRAINT IF EXISTS download_requests_user_id_fkey;
ALTER TABLE download_requests
  ADD CONSTRAINT download_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE password_reset_requests
  DROP CONSTRAINT IF EXISTS password_reset_requests_user_id_fkey;
ALTER TABLE password_reset_requests
  ADD CONSTRAINT password_reset_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE case_change_logs
  DROP CONSTRAINT IF EXISTS case_change_logs_actor_user_id_fkey;
ALTER TABLE case_change_logs
  ADD CONSTRAINT case_change_logs_actor_user_id_fkey
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE case_attachments
  DROP CONSTRAINT IF EXISTS case_attachments_case_id_fkey;
ALTER TABLE case_attachments
  ADD CONSTRAINT case_attachments_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
