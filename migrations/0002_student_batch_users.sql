ALTER TABLE users ADD COLUMN student_batch INTEGER;

CREATE INDEX IF NOT EXISTS idx_users_student_batch ON users(student_batch);
