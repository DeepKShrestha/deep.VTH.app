CREATE TABLE IF NOT EXISTS admin_action_logs (
  id SERIAL PRIMARY KEY,
  actor_user_id INTEGER NOT NULL,
  actor_role TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_action_logs_created_at_idx
  ON admin_action_logs(created_at);
CREATE INDEX IF NOT EXISTS admin_action_logs_actor_idx
  ON admin_action_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS admin_action_logs_action_idx
  ON admin_action_logs(action_type);

WITH ranked AS (
  SELECT
    id,
    CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'CASE' ELSE 'AST' END AS scope_prefix,
    substr(date, 1, 4) AS bs_year,
    substr(date, 1, 7) AS bs_year_month,
    ROW_NUMBER() OVER (
      PARTITION BY CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END, date
      ORDER BY created_at, id
    ) AS daily_rn,
    ROW_NUMBER() OVER (
      PARTITION BY CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END, substr(date, 1, 7)
      ORDER BY created_at, id
    ) AS monthly_rn,
    ROW_NUMBER() OVER (
      PARTITION BY CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END, substr(date, 1, 4)
      ORDER BY created_at, id
    ) AS yearly_rn,
    ROW_NUMBER() OVER (
      PARTITION BY CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END, substr(date, 1, 7)
      ORDER BY created_at, id
    ) AS case_seq
  FROM cases
)
UPDATE cases
SET
  daily_number = ranked.daily_rn,
  monthly_number = ranked.monthly_rn,
  yearly_number = ranked.yearly_rn,
  case_number = ranked.scope_prefix || '-' || replace(ranked.bs_year_month, '-', '') || '-' || lpad(ranked.case_seq::text, 3, '0')
FROM ranked
WHERE ranked.id = cases.id;

CREATE UNIQUE INDEX IF NOT EXISTS cases_case_number_unique_idx
  ON cases(case_number);

CREATE UNIQUE INDEX IF NOT EXISTS cases_scope_date_daily_unique_idx
  ON cases(
    (CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END),
    date,
    daily_number
  )
  WHERE daily_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cases_scope_month_monthly_unique_idx
  ON cases(
    (CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END),
    substr(date, 1, 7),
    monthly_number
  )
  WHERE monthly_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cases_scope_year_yearly_unique_idx
  ON cases(
    (CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END),
    substr(date, 1, 4),
    yearly_number
  )
  WHERE yearly_number IS NOT NULL;

