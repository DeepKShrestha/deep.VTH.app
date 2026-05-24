-- Atomic case / daily / monthly / yearly sequence counters (per scope + period).
CREATE TABLE IF NOT EXISTS case_counters (
  scope TEXT NOT NULL,
  counter_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scope, counter_type, period_key)
);

INSERT INTO case_counters (scope, counter_type, period_key, last_value, updated_at)
SELECT
  CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END,
  'case_number',
  regexp_replace(case_number, '-[0-9]{3}$', ''),
  MAX(CAST(right(case_number, 3) AS INTEGER)),
  NOW()::TEXT
FROM cases
WHERE case_number ~ '^(AST|CASE)-[0-9]+-[0-9]{3}$'
GROUP BY 1, 2, 3
ON CONFLICT (scope, counter_type, period_key) DO NOTHING;

INSERT INTO case_counters (scope, counter_type, period_key, last_value, updated_at)
SELECT
  CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END,
  'daily',
  date,
  MAX(daily_number),
  NOW()::TEXT
FROM cases
WHERE daily_number IS NOT NULL
GROUP BY 1, 2, 3
ON CONFLICT (scope, counter_type, period_key) DO NOTHING;

INSERT INTO case_counters (scope, counter_type, period_key, last_value, updated_at)
SELECT
  CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END,
  'monthly',
  left(date, 7),
  MAX(monthly_number),
  NOW()::TEXT
FROM cases
WHERE monthly_number IS NOT NULL
GROUP BY 1, 2, 3
ON CONFLICT (scope, counter_type, period_key) DO NOTHING;

INSERT INTO case_counters (scope, counter_type, period_key, last_value, updated_at)
SELECT
  CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END,
  'yearly',
  left(date, 4),
  MAX(yearly_number),
  NOW()::TEXT
FROM cases
WHERE yearly_number IS NOT NULL
GROUP BY 1, 2, 3
ON CONFLICT (scope, counter_type, period_key) DO NOTHING;
