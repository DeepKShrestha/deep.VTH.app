-- Referential integrity: remove orphans, then enforce via triggers (SQLite)
-- and FK constraints (Postgres uses migrations-pg/0016_foreign_keys.sql).

DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM download_requests WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM password_reset_requests WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM case_change_logs WHERE actor_user_id NOT IN (SELECT id FROM users);
DELETE FROM case_attachments
WHERE case_id IS NOT NULL AND case_id NOT IN (SELECT id FROM cases);

DROP TRIGGER IF EXISTS fk_sessions_user_delete;
CREATE TRIGGER fk_sessions_user_delete
AFTER DELETE ON users
BEGIN
  DELETE FROM sessions WHERE user_id = OLD.id;
END;

DROP TRIGGER IF EXISTS fk_download_requests_user_delete;
CREATE TRIGGER fk_download_requests_user_delete
AFTER DELETE ON users
BEGIN
  DELETE FROM download_requests WHERE user_id = OLD.id;
END;

DROP TRIGGER IF EXISTS fk_password_reset_requests_user_delete;
CREATE TRIGGER fk_password_reset_requests_user_delete
AFTER DELETE ON users
BEGIN
  DELETE FROM password_reset_requests WHERE user_id = OLD.id;
END;

DROP TRIGGER IF EXISTS fk_case_attachments_case_delete;
CREATE TRIGGER fk_case_attachments_case_delete
AFTER DELETE ON cases
BEGIN
  DELETE FROM case_attachments WHERE case_id = OLD.id;
END;
