-- Allow deleting users who appear in case audit history. Names are already
-- stored on each log row (actor_name, actor_username), so history stays readable.

ALTER TABLE case_change_logs
  DROP CONSTRAINT IF EXISTS case_change_logs_actor_user_id_fkey;

ALTER TABLE case_change_logs
  ALTER COLUMN actor_user_id DROP NOT NULL;

ALTER TABLE case_change_logs
  ADD CONSTRAINT case_change_logs_actor_user_id_fkey
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;
