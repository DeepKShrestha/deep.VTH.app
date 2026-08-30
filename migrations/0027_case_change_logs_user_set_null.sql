-- Match Postgres: actor_user_id may be null after the user row is removed.
-- Case history still shows actor_name / actor_username on each row.

ALTER TABLE case_change_logs ALTER COLUMN actor_user_id DROP NOT NULL;
