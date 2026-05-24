import { sql } from "drizzle-orm";
import NepaliDateImport from "nepali-date-converter";
import { dbGet } from "./db-query";

const NepaliDateClass = (NepaliDateImport as any).default || NepaliDateImport;

export type CaseScope = "ast" | "hospital";

export type CaseIdentifierBundle = {
  caseNumber: string;
  dailyNumber: number;
  monthlyNumber: number;
  yearlyNumber: number;
};

function scopePrefix(scope: CaseScope): string {
  return scope === "hospital" ? "CASE" : "AST";
}

/** Case-number month bucket uses the current Nepali calendar month (existing behaviour). */
function currentCaseNumberPeriodKey(scope: CaseScope): string {
  const nd = new NepaliDateClass();
  const bsYear = nd.getYear();
  const bsMonth = String(nd.getMonth() + 1).padStart(2, "0");
  return `${scopePrefix(scope)}-${bsYear}${bsMonth}`;
}

async function bumpCounter(
  scope: CaseScope,
  counterType: "case_number" | "daily" | "monthly" | "yearly",
  periodKey: string,
): Promise<number> {
  const row = await dbGet<{ last_value: number | string }>(sql`
    INSERT INTO case_counters (scope, counter_type, period_key, last_value, updated_at)
    VALUES (${scope}, ${counterType}, ${periodKey}, 1, ${new Date().toISOString()})
    ON CONFLICT(scope, counter_type, period_key)
    DO UPDATE SET
      last_value = case_counters.last_value + 1,
      updated_at = excluded.updated_at
    RETURNING last_value
  `);
  const n = Number(row?.last_value ?? 0);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`Failed to allocate ${counterType} counter for ${scope}/${periodKey}`);
  }
  return n;
}

async function peekCounter(
  scope: CaseScope,
  counterType: "case_number" | "daily" | "monthly" | "yearly",
  periodKey: string,
  fallbackSql: ReturnType<typeof sql>,
): Promise<number> {
  const row = await dbGet<{ last_value: number | string }>(sql`
    SELECT last_value FROM case_counters
    WHERE scope = ${scope} AND counter_type = ${counterType} AND period_key = ${periodKey}
  `);
  if (row != null) return Number(row.last_value) + 1;
  const fb = await dbGet<{ count: number | string }>(fallbackSql);
  return Number(fb?.count ?? 0) + 1;
}

/**
 * Atomically reserve the next case identifiers for a new registration.
 * Uses UPSERT on `case_counters` so concurrent inserts cannot receive duplicates.
 */
export async function allocateCaseIdentifiers(
  scope: CaseScope,
  dateBs: string,
): Promise<CaseIdentifierBundle> {
  const yearMonth = dateBs.substring(0, 7);
  const year = dateBs.substring(0, 4);
  const casePeriod = currentCaseNumberPeriodKey(scope);

  const [caseSeq, daily, monthly, yearly] = await Promise.all([
    bumpCounter(scope, "case_number", casePeriod),
    bumpCounter(scope, "daily", dateBs),
    bumpCounter(scope, "monthly", yearMonth),
    bumpCounter(scope, "yearly", year),
  ]);

  return {
    caseNumber: `${casePeriod}-${String(caseSeq).padStart(3, "0")}`,
    dailyNumber: daily,
    monthlyNumber: monthly,
    yearlyNumber: yearly,
  };
}

/** Preview the next identifiers without consuming them (for /api/next-case-info). */
export async function peekCaseIdentifiers(
  scope: CaseScope,
  dateBs: string,
): Promise<CaseIdentifierBundle> {
  const yearMonth = dateBs.substring(0, 7);
  const year = dateBs.substring(0, 4);
  const casePeriod = currentCaseNumberPeriodKey(scope);
  const scopeLike = `${scopePrefix(scope)}-%`;

  const [caseSeq, daily, monthly, yearly] = await Promise.all([
    peekCounter(
      scope,
      "case_number",
      casePeriod,
      sql`SELECT COUNT(*) as count FROM cases WHERE case_number LIKE ${`${casePeriod}%`}`,
    ),
    peekCounter(
      scope,
      "daily",
      dateBs,
      sql`SELECT COUNT(*) as count FROM cases WHERE date = ${dateBs} AND case_number LIKE ${scopeLike}`,
    ),
    peekCounter(
      scope,
      "monthly",
      yearMonth,
      sql`SELECT COUNT(*) as count FROM cases WHERE date LIKE ${`${yearMonth}%`} AND case_number LIKE ${scopeLike}`,
    ),
    peekCounter(
      scope,
      "yearly",
      year,
      sql`SELECT COUNT(*) as count FROM cases WHERE date LIKE ${`${year}%`} AND case_number LIKE ${scopeLike}`,
    ),
  ]);

  return {
    caseNumber: `${casePeriod}-${String(caseSeq).padStart(3, "0")}`,
    dailyNumber: daily,
    monthlyNumber: monthly,
    yearlyNumber: yearly,
  };
}
