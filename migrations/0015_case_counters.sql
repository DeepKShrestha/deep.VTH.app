-- Atomic case / daily / monthly / yearly sequence counters (per scope + period).
CREATE TABLE IF NOT EXISTS case_counters (
  scope TEXT NOT NULL,
  counter_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scope, counter_type, period_key)
);

-- Seed from existing data so the next allocation does not collide.
INSERT OR IGNORE INTO case_counters (scope, counter_type, period_key, last_value, updated_at)
SELECT
  CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END,
  'case_number',
  substr(case_number, 1, length(case_number) - 4),
  MAX(CAST(substr(case_number, -3) AS INTEGER)),
  datetime('now')
FROM cases
WHERE case_number GLOB 'AST-*-*' OR case_number GLOB 'CASE-*-*'
GROUP BY 1, 2, 3;

INSERT OR IGNORE INTO case_counters (scope, counter_type, period_key, last_value, updated_at)
SELECT
  CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END,
  'daily',
  date,
  MAX(daily_number),
  datetime('now')
FROM cases
WHERE daily_number IS NOT NULL
GROUP BY 1, 2, 3;

INSERT OR IGNORE INTO case_counters (scope, counter_type, period_key, last_value, updated_at)
SELECT
  CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END,
  'monthly',
  substr(date, 1, 7),
  MAX(monthly_number),
  datetime('now')
FROM cases
WHERE monthly_number IS NOT NULL
GROUP BY 1, 2, 3;

INSERT OR IGNORE INTO case_counters (scope, counter_type, period_key, last_value, updated_at)
SELECT
  CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END,
  'yearly',
  substr(date, 1, 4),
  MAX(yearly_number),
  datetime('now')
FROM cases
WHERE yearly_number IS NOT NULL
GROUP BY 1, 2, 3;
