const Database = require("better-sqlite3");

const db = new Database("./data.db");

const sql = `
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END,
        date
      ORDER BY created_at, id
    ) AS daily_rn,
    ROW_NUMBER() OVER (
      PARTITION BY
        CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END,
        substr(date, 1, 7)
      ORDER BY created_at, id
    ) AS monthly_rn,
    ROW_NUMBER() OVER (
      PARTITION BY
        CASE WHEN UPPER(case_number) LIKE 'CASE-%' THEN 'hospital' ELSE 'ast' END,
        substr(date, 1, 4)
      ORDER BY created_at, id
    ) AS yearly_rn
  FROM cases
)
UPDATE cases
SET
  daily_number = (SELECT daily_rn FROM ranked WHERE ranked.id = cases.id),
  monthly_number = (SELECT monthly_rn FROM ranked WHERE ranked.id = cases.id),
  yearly_number = (SELECT yearly_rn FROM ranked WHERE ranked.id = cases.id);
`;

db.exec(sql);

const rows = db
  .prepare(
    `select id, case_number, date, daily_number, monthly_number, yearly_number
     from cases
     where upper(case_number) like 'CASE-%' and substr(date,1,4)='2083'
     order by created_at, id`,
  )
  .all();

console.log(rows);
