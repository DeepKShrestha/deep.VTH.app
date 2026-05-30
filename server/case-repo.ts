import type { Case, InsertCase } from "@shared/schema";
import { sql, type SQL } from "drizzle-orm";
import { dbAll, dbGet, dbInsertReturningId, dbRun } from "./db-query";
import NepaliDateImport from "nepali-date-converter";

const NepaliDateClass = (NepaliDateImport as any).default || NepaliDateImport;
function getNepaliDateClass() {
  return NepaliDateClass;
}

type CaseRow = {
  id: number;
  case_number: string;
  bill_number: string | null;
  daily_number: number | null;
  monthly_number: number | null;
  yearly_number: number | null;
  date: string;
  date_ad: string | null;
  owner_name: string;
  owner_address: string;
  owner_phone: string;
  species: string;
  breed: string;
  animal_name: string | null;
  age: string | null;
  sex: string | null;
  sample_type: string | null;
  sample_date: string | null;
  sample_date_ad: string | null;
  culture_result: string | null;
  ast_results: string | null;
  remarks: string | null;
  registered_by: number | null;
  created_at: string;
  last_updated_by: number | null;
  last_updated_by_name: string | null;
  updated_at: string | null;
  custom_fields: string | null;
  treatment_details: string | null;
  veterinarian_id: number | null;
  veterinarian_name: string | null;
  veterinarian_nvc: string | null;
  veterinarian_department: string | null;
};

function toCase(row: CaseRow): Case {
  return {
    id: row.id,
    caseNumber: row.case_number,
    billNumber: row.bill_number,
    dailyNumber: row.daily_number,
    monthlyNumber: row.monthly_number,
    yearlyNumber: row.yearly_number,
    date: row.date,
    dateAd: row.date_ad,
    ownerName: row.owner_name,
    ownerAddress: row.owner_address,
    ownerPhone: row.owner_phone,
    species: row.species,
    breed: row.breed,
    animalName: row.animal_name,
    age: row.age,
    sex: row.sex,
    sampleType: row.sample_type,
    sampleDate: row.sample_date,
    sampleDateAd: row.sample_date_ad,
    cultureResult: row.culture_result,
    astResults: row.ast_results,
    remarks: row.remarks,
    registeredBy: row.registered_by,
    createdAt: row.created_at,
    lastUpdatedBy: row.last_updated_by,
    lastUpdatedByName: row.last_updated_by_name,
    updatedAt: row.updated_at,
    customFields: row.custom_fields,
    treatmentDetails: row.treatment_details,
    veterinarianId: row.veterinarian_id,
    veterinarianName: row.veterinarian_name,
    veterinarianNvc: row.veterinarian_nvc,
    veterinarianDepartment: row.veterinarian_department,
  };
}

const CASE_SELECT = sql`SELECT id, case_number, bill_number, daily_number, monthly_number, yearly_number, date, date_ad, owner_name, owner_address, owner_phone, species, breed, animal_name, age, sex, sample_type, sample_date, sample_date_ad, culture_result, ast_results, remarks, registered_by, created_at, last_updated_by, last_updated_by_name, updated_at, custom_fields, treatment_details, veterinarian_id, veterinarian_name, veterinarian_nvc, veterinarian_department FROM cases`;

type CaseScope = "ast" | "hospital";

/** When `role` is `student`, queries are restricted to rows that user registered. */
export type CaseViewerAccess = { role: string; userId: number };

function getScopePrefix(scope: CaseScope): string {
  return scope === "hospital" ? "CASE" : "AST";
}

function viewerRowSql(viewer?: CaseViewerAccess): SQL {
  if (!viewer || viewer.role !== "student") return sql`1=1`;
  return sql`registered_by = ${viewer.userId}`;
}

export type CaseListFilters = {
  q?: string;
  species?: string;
  dateFrom?: string;
  dateTo?: string;
};

function buildCaseListWhere(scope: CaseScope | undefined, filters: CaseListFilters): SQL {
  const parts: SQL[] = [];
  if (scope) {
    parts.push(sql`case_number LIKE ${`${getScopePrefix(scope)}-%`}`);
  }
  const q = filters.q?.trim();
  if (q) {
    const needle = `%${q.replace(/%/g, "").replace(/_/g, "").slice(0, 120)}%`;
    const digits = q.replace(/\D/g, "").slice(0, 20);
    if (digits.length > 0) {
      parts.push(
        sql`(LOWER(case_number) LIKE LOWER(${needle}) OR LOWER(owner_name) LIKE LOWER(${needle}) OR LOWER(species) LIKE LOWER(${needle}) OR LOWER(breed) LIKE LOWER(${needle}) OR LOWER(COALESCE(bill_number,'')) LIKE LOWER(${needle}) OR owner_phone LIKE ${`%${digits}%`})`,
      );
    } else {
      parts.push(
        sql`(LOWER(case_number) LIKE LOWER(${needle}) OR LOWER(owner_name) LIKE LOWER(${needle}) OR LOWER(species) LIKE LOWER(${needle}) OR LOWER(breed) LIKE LOWER(${needle}) OR LOWER(COALESCE(bill_number,'')) LIKE LOWER(${needle}))`,
      );
    }
  }
  const sp = filters.species?.trim();
  if (sp) {
    // Case-insensitive exact match — cases are stored title-cased (e.g. "Canine")
    // but the list filter must still work when the UI sends a different case.
    parts.push(sql`LOWER(TRIM(species)) = LOWER(${sp})`);
  }
  if (filters.dateFrom?.trim()) {
    parts.push(sql`date >= ${filters.dateFrom.trim()}`);
  }
  if (filters.dateTo?.trim()) {
    parts.push(sql`date <= ${filters.dateTo.trim()}`);
  }
  return parts.length ? sql.join(parts, sql` AND `) : sql`1=1`;
}

export const caseRepo = {
  async getCases(scope?: CaseScope, viewer?: CaseViewerAccess): Promise<Case[]> {
    const v = viewerRowSql(viewer);
    const rows = await dbAll<CaseRow>(
      scope
        ? sql`${CASE_SELECT} WHERE case_number LIKE ${`${getScopePrefix(scope)}-%`} AND ${v} ORDER BY created_at DESC`
        : sql`${CASE_SELECT} WHERE ${v} ORDER BY created_at DESC`,
    );
    return rows.map(toCase);
  },

  async getCasesPage(
    limit: number,
    offset: number,
    scope?: CaseScope,
    viewer?: CaseViewerAccess,
  ): Promise<{ items: Case[]; total: number }> {
    const v = viewerRowSql(viewer);
    const rows = await dbAll<CaseRow>(
      scope
        ? sql`${CASE_SELECT} WHERE case_number LIKE ${`${getScopePrefix(scope)}-%`} AND ${v} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : sql`${CASE_SELECT} WHERE ${v} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    );
    const totalRow = await dbGet<{ count: number | string }>(
      scope
        ? sql`SELECT COUNT(*) as count FROM cases WHERE case_number LIKE ${`${getScopePrefix(scope)}-%`} AND ${v}`
        : sql`SELECT COUNT(*) as count FROM cases WHERE ${v}`,
    );
    return {
      items: rows.map(toCase),
      total: Number(totalRow?.count ?? 0),
    };
  },

  async getCasesFilteredPage(
    limit: number,
    offset: number,
    scope: CaseScope | undefined,
    filters: CaseListFilters,
    viewer?: CaseViewerAccess,
  ): Promise<{ items: Case[]; total: number }> {
    const baseWhere = buildCaseListWhere(scope, filters);
    const where = sql.join([baseWhere, viewerRowSql(viewer)], sql` AND `);
    const rows = await dbAll<CaseRow>(
      sql`${CASE_SELECT} WHERE ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    );
    const totalRow = await dbGet<{ count: number | string }>(
      sql`SELECT COUNT(*) as count FROM cases WHERE ${where}`,
    );
    return {
      items: rows.map(toCase),
      total: Number(totalRow?.count ?? 0),
    };
  },

  async getCase(id: number, scope?: CaseScope, viewer?: CaseViewerAccess): Promise<Case | undefined> {
    const v = viewerRowSql(viewer);
    const row = await dbGet<CaseRow>(
      scope
        ? sql`${CASE_SELECT} WHERE id = ${id} AND case_number LIKE ${`${getScopePrefix(scope)}-%`} AND ${v}`
        : sql`${CASE_SELECT} WHERE id = ${id} AND ${v}`,
    );
    return row ? toCase(row) : undefined;
  },

  async createCase(
    data: InsertCase &
      Partial<Pick<Case, "lastUpdatedBy" | "lastUpdatedByName" | "updatedAt">>,
  ): Promise<Case> {
    const newId = await dbInsertReturningId(
      sql`INSERT INTO cases
          (case_number, bill_number, daily_number, monthly_number, yearly_number, date, date_ad, owner_name, owner_address, owner_phone, species, breed, animal_name, age, sex, sample_type, sample_date, sample_date_ad, culture_result, ast_results, remarks, registered_by, created_at, last_updated_by, last_updated_by_name, updated_at, custom_fields, treatment_details, veterinarian_id, veterinarian_name, veterinarian_nvc, veterinarian_department)
          VALUES (
            ${data.caseNumber},
            ${data.billNumber ?? null},
            ${data.dailyNumber ?? null},
            ${data.monthlyNumber ?? null},
            ${data.yearlyNumber ?? null},
            ${data.date},
            ${data.dateAd ?? null},
            ${data.ownerName},
            ${data.ownerAddress},
            ${data.ownerPhone},
            ${data.species},
            ${data.breed},
            ${data.animalName ?? null},
            ${data.age ?? null},
            ${data.sex ?? null},
            ${data.sampleType ?? null},
            ${data.sampleDate ?? null},
            ${data.sampleDateAd ?? null},
            ${data.cultureResult ?? null},
            ${data.astResults ?? null},
            ${data.remarks ?? null},
            ${data.registeredBy ?? null},
            ${new Date().toISOString()},
            ${data.lastUpdatedBy ?? null},
            ${data.lastUpdatedByName ?? null},
            ${data.updatedAt ?? null},
            ${data.customFields ?? null},
            ${data.treatmentDetails ?? null},
            ${data.veterinarianId ?? null},
            ${data.veterinarianName ?? null},
            ${data.veterinarianNvc ?? null},
            ${data.veterinarianDepartment ?? null}
          )`,
    );
    const created = await dbGet<CaseRow>(sql`${CASE_SELECT} WHERE id = ${newId}`);
    if (!created) throw new Error("Failed to create case");
    return toCase(created);
  },

  async updateCase(
    id: number,
    patch: Partial<InsertCase> &
      Partial<Pick<Case, "lastUpdatedBy" | "lastUpdatedByName" | "updatedAt">>,
    scope?: CaseScope,
    viewer?: CaseViewerAccess,
  ): Promise<Case | undefined> {
    const existing = await this.getCase(id, scope, viewer);
    if (!existing) return undefined;
    const next = { ...existing, ...patch };
    await dbRun(
      sql`UPDATE cases
          SET case_number = ${next.caseNumber},
              bill_number = ${next.billNumber ?? null},
              daily_number = ${next.dailyNumber ?? null},
              monthly_number = ${next.monthlyNumber ?? null},
              yearly_number = ${next.yearlyNumber ?? null},
              date = ${next.date},
              date_ad = ${next.dateAd ?? null},
              owner_name = ${next.ownerName},
              owner_address = ${next.ownerAddress},
              owner_phone = ${next.ownerPhone},
              species = ${next.species},
              breed = ${next.breed},
              animal_name = ${next.animalName ?? null},
              age = ${next.age ?? null},
              sex = ${next.sex ?? null},
              sample_type = ${next.sampleType ?? null},
              sample_date = ${next.sampleDate ?? null},
              sample_date_ad = ${next.sampleDateAd ?? null},
              culture_result = ${next.cultureResult ?? null},
              ast_results = ${next.astResults ?? null},
              remarks = ${next.remarks ?? null},
              registered_by = ${next.registeredBy ?? null},
              last_updated_by = ${next.lastUpdatedBy ?? null},
              last_updated_by_name = ${next.lastUpdatedByName ?? null},
              updated_at = ${next.updatedAt ?? null},
              custom_fields = ${next.customFields ?? null},
              treatment_details = ${next.treatmentDetails ?? null},
              veterinarian_id = ${next.veterinarianId ?? null},
              veterinarian_name = ${next.veterinarianName ?? null},
              veterinarian_nvc = ${next.veterinarianNvc ?? null},
              veterinarian_department = ${next.veterinarianDepartment ?? null}
          WHERE id = ${id}`,
    );
    return this.getCase(id, scope, viewer);
  },

  async deleteCase(id: number, scope?: CaseScope): Promise<void> {
    if (scope) {
      await dbRun(
        sql`DELETE FROM cases WHERE id = ${id} AND case_number LIKE ${`${getScopePrefix(scope)}-%`}`,
      );
      return;
    }
    await dbRun(sql`DELETE FROM cases WHERE id = ${id}`);
  },

  async getCasesByDateRange(dateFrom?: string, dateTo?: string): Promise<Case[]> {
    const parts: SQL[] = [];
    if (dateFrom?.trim()) parts.push(sql`date >= ${dateFrom.trim()}`);
    if (dateTo?.trim()) parts.push(sql`date <= ${dateTo.trim()}`);
    const where = parts.length ? sql.join(parts, sql` AND `) : sql`1=1`;
    const rows = await dbAll<CaseRow>(
      sql`${CASE_SELECT} WHERE ${where} ORDER BY created_at DESC`,
    );
    return rows.map(toCase);
  },

  async getCasesByDateRangeAndScope(
    scope: CaseScope,
    dateFrom?: string,
    dateTo?: string,
    viewer?: CaseViewerAccess,
    species?: string,
  ): Promise<Case[]> {
    const scopePrefix = `${getScopePrefix(scope)}-%`;
    const v = viewerRowSql(viewer);
    const parts: SQL[] = [
      sql`case_number LIKE ${`${scopePrefix}%`}`,
      v,
    ];
    if (dateFrom?.trim()) parts.push(sql`date >= ${dateFrom.trim()}`);
    if (dateTo?.trim()) parts.push(sql`date <= ${dateTo.trim()}`);
    const sp = species?.trim();
    if (sp) {
      parts.push(sql`LOWER(TRIM(species)) = LOWER(${sp})`);
    }
    const where = sql.join(parts, sql` AND `);
    const rows = await dbAll<CaseRow>(
      sql`${CASE_SELECT} WHERE ${where} ORDER BY created_at DESC`,
    );
    return rows.map(toCase);
  },

  /**
   * Cases for the AST/hospital dashboard — filtered in SQL instead of loading
   * the full table into memory. Antibiotic/result filters still run in JS on
   * the reduced row set.
   */
  async getCasesForDashboard(
    scope: CaseScope,
    filters: {
      viewer?: CaseViewerAccess;
      dateFromAd?: string;
      dateToAd?: string;
      dateFromBs?: string;
      dateToBs?: string;
      species?: string;
      breed?: string;
      sex?: string;
      sampleType?: string;
      organism?: string;
    },
  ): Promise<Case[]> {
    const scopePrefix = `${getScopePrefix(scope)}-%`;
    const parts: SQL[] = [sql`case_number LIKE ${`${scopePrefix}%`}`, viewerRowSql(filters.viewer)];

    const sampleDateAdExpr = sql`COALESCE(NULLIF(TRIM(sample_date_ad), ''), NULLIF(TRIM(date_ad), ''))`;
    const sampleDateBsExpr = sql`COALESCE(NULLIF(TRIM(sample_date), ''), NULLIF(TRIM(date), ''))`;
    const dateBranches: SQL[] = [];
    if (filters.dateFromAd?.trim() || filters.dateToAd?.trim()) {
      const adParts: SQL[] = [];
      if (filters.dateFromAd?.trim()) {
        adParts.push(sql`${sampleDateAdExpr} >= ${filters.dateFromAd.trim()}`);
      }
      if (filters.dateToAd?.trim()) {
        adParts.push(sql`${sampleDateAdExpr} <= ${filters.dateToAd.trim()}`);
      }
      if (adParts.length) dateBranches.push(sql`(${sql.join(adParts, sql` AND `)})`);
    }
    if (filters.dateFromBs?.trim() || filters.dateToBs?.trim()) {
      const bsParts: SQL[] = [];
      if (filters.dateFromBs?.trim()) {
        bsParts.push(sql`${sampleDateBsExpr} >= ${filters.dateFromBs.trim()}`);
      }
      if (filters.dateToBs?.trim()) {
        bsParts.push(sql`${sampleDateBsExpr} <= ${filters.dateToBs.trim()}`);
      }
      if (bsParts.length) dateBranches.push(sql`(${sql.join(bsParts, sql` AND `)})`);
    }
    if (dateBranches.length === 1) {
      parts.push(dateBranches[0]!);
    } else if (dateBranches.length > 1) {
      parts.push(sql`(${sql.join(dateBranches, sql` OR `)})`);
    }
    if (filters.species && filters.species !== "all") {
      parts.push(sql`LOWER(TRIM(species)) = LOWER(${filters.species.trim()})`);
    }
    if (filters.breed && filters.breed !== "all") {
      parts.push(sql`LOWER(TRIM(breed)) = LOWER(${filters.breed.trim()})`);
    }
    if (filters.sex && filters.sex !== "all") {
      parts.push(
        sql`LOWER(TRIM(COALESCE(sex, 'Unknown'))) = LOWER(${filters.sex.trim()})`,
      );
    }
    if (filters.sampleType && filters.sampleType !== "all") {
      parts.push(
        sql`LOWER(TRIM(COALESCE(sample_type, 'Unknown'))) = LOWER(${filters.sampleType.trim()})`,
      );
    }
    if (filters.organism && filters.organism !== "all") {
      parts.push(
        sql`LOWER(TRIM(COALESCE(culture_result, ''))) = LOWER(${filters.organism.trim()})`,
      );
    }

    const where = sql.join(parts, sql` AND `);
    const rows = await dbAll<CaseRow>(
      sql`${CASE_SELECT} WHERE ${where} ORDER BY created_at DESC LIMIT 15000`,
    );
    return rows.map(toCase);
  },

  /** Distinct filter option values for dashboard dropdowns (scoped, viewer-safe). */
  async getDashboardFilterOptions(
    scope: CaseScope,
    viewer?: CaseViewerAccess,
  ): Promise<{
    species: string[];
    breeds: string[];
    sexes: string[];
    sampleTypes: string[];
    organisms: string[];
  }> {
    const scopePrefix = `${getScopePrefix(scope)}-%`;
    const base = sql`case_number LIKE ${`${scopePrefix}%`} AND ${viewerRowSql(viewer)}`;
    const [speciesRows, breedRows, sexRows, sampleRows, orgRows] = await Promise.all([
      dbAll<{ v: string }>(
        sql`SELECT DISTINCT TRIM(species) as v FROM cases WHERE ${base} AND TRIM(species) != '' ORDER BY v`,
      ),
      dbAll<{ v: string }>(
        sql`SELECT DISTINCT TRIM(breed) as v FROM cases WHERE ${base} AND TRIM(breed) != '' ORDER BY v`,
      ),
      dbAll<{ v: string }>(
        sql`SELECT DISTINCT TRIM(COALESCE(sex, 'Unknown')) as v FROM cases WHERE ${base} ORDER BY v`,
      ),
      dbAll<{ v: string }>(
        sql`SELECT DISTINCT TRIM(COALESCE(sample_type, 'Unknown')) as v FROM cases WHERE ${base} ORDER BY v`,
      ),
      dbAll<{ v: string }>(
        sql`SELECT DISTINCT TRIM(culture_result) as v FROM cases WHERE ${base} AND TRIM(COALESCE(culture_result, '')) != '' ORDER BY v`,
      ),
    ]);
    return {
      species: speciesRows.map((r) => r.v),
      breeds: breedRows.map((r) => r.v),
      sexes: sexRows.map((r) => r.v),
      sampleTypes: sampleRows.map((r) => r.v),
      organisms: orgRows.map((r) => r.v),
    };
  },

  async getNextCaseNumber(scope: CaseScope = "ast"): Promise<string> {
    const { peekCaseIdentifiers } = await import("./case-counters");
    const NepaliDate = getNepaliDateClass();
    const nd = new NepaliDate();
    const bsMonth = String(nd.getMonth() + 1).padStart(2, "0");
    const bsDay = String(nd.getDate()).padStart(2, "0");
    const todayBs = `${nd.getYear()}-${bsMonth}-${bsDay}`;
    const peek = await peekCaseIdentifiers(scope, todayBs);
    return peek.caseNumber;
  },

  async getDailyNumber(date: string, scope: CaseScope = "ast"): Promise<number> {
    const { peekCaseIdentifiers } = await import("./case-counters");
    const peek = await peekCaseIdentifiers(scope, date);
    return peek.dailyNumber;
  },

  async getMonthlyNumber(yearMonth: string, scope: CaseScope = "ast"): Promise<number> {
    const { peekCaseIdentifiers } = await import("./case-counters");
    const peek = await peekCaseIdentifiers(scope, `${yearMonth}-01`);
    return peek.monthlyNumber;
  },

  async getYearlyNumber(year: string, scope: CaseScope = "ast"): Promise<number> {
    const { peekCaseIdentifiers } = await import("./case-counters");
    const peek = await peekCaseIdentifiers(scope, `${year}-01-01`);
    return peek.yearlyNumber;
  },
};
