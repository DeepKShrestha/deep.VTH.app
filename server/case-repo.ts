import type { Case, InsertCase } from "@shared/schema";
import { sql } from "drizzle-orm";
import { dbAll, dbGet, dbRun } from "./db-query";
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

function getScopePrefix(scope: CaseScope): string {
  return scope === "hospital" ? "CASE" : "AST";
}

export const caseRepo = {
  async getCases(scope?: CaseScope): Promise<Case[]> {
    const rows = await dbAll<CaseRow>(
      scope
        ? sql`${CASE_SELECT} WHERE case_number LIKE ${`${getScopePrefix(scope)}-%`} ORDER BY created_at DESC`
        : sql`${CASE_SELECT} ORDER BY created_at DESC`,
    );
    return rows.map(toCase);
  },

  async getCasesPage(
    limit: number,
    offset: number,
    scope?: CaseScope,
  ): Promise<{ items: Case[]; total: number }> {
    const rows = await dbAll<CaseRow>(
      scope
        ? sql`${CASE_SELECT} WHERE case_number LIKE ${`${getScopePrefix(scope)}-%`} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : sql`${CASE_SELECT} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    );
    const totalRow = await dbGet<{ count: number | string }>(
      scope
        ? sql`SELECT COUNT(*) as count FROM cases WHERE case_number LIKE ${`${getScopePrefix(scope)}-%`}`
        : sql`SELECT COUNT(*) as count FROM cases`,
    );
    return {
      items: rows.map(toCase),
      total: Number(totalRow?.count ?? 0),
    };
  },

  async getCase(id: number, scope?: CaseScope): Promise<Case | undefined> {
    const row = await dbGet<CaseRow>(
      scope
        ? sql`${CASE_SELECT} WHERE id = ${id} AND case_number LIKE ${`${getScopePrefix(scope)}-%`}`
        : sql`${CASE_SELECT} WHERE id = ${id}`,
    );
    return row ? toCase(row) : undefined;
  },

  async createCase(
    data: InsertCase &
      Partial<Pick<Case, "lastUpdatedBy" | "lastUpdatedByName" | "updatedAt">>,
  ): Promise<Case> {
    await dbRun(
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
    const created = await dbGet<CaseRow>(sql`${CASE_SELECT} ORDER BY id DESC LIMIT 1`);
    if (!created) throw new Error("Failed to create case");
    return toCase(created);
  },

  async updateCase(
    id: number,
    patch: Partial<InsertCase> &
      Partial<Pick<Case, "lastUpdatedBy" | "lastUpdatedByName" | "updatedAt">>,
    scope?: CaseScope,
  ): Promise<Case | undefined> {
    const existing = await this.getCase(id, scope);
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
    return this.getCase(id, scope);
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
    let rows = await dbAll<CaseRow>(sql`${CASE_SELECT} ORDER BY created_at DESC`);
    if (dateFrom) rows = rows.filter((c) => c.date >= dateFrom);
    if (dateTo) rows = rows.filter((c) => c.date <= dateTo);
    return rows.map(toCase);
  },

  async getCasesByDateRangeAndScope(
    scope: CaseScope,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<Case[]> {
    const scopePrefix = `${getScopePrefix(scope)}-`;
    let rows = await dbAll<CaseRow>(
      sql`${CASE_SELECT} WHERE case_number LIKE ${`${scopePrefix}%`} ORDER BY created_at DESC`,
    );
    if (dateFrom) rows = rows.filter((c) => c.date >= dateFrom);
    if (dateTo) rows = rows.filter((c) => c.date <= dateTo);
    return rows.map(toCase);
  },

  async getNextCaseNumber(scope: CaseScope = "ast"): Promise<string> {
    const NepaliDate = getNepaliDateClass();
    const nd = new NepaliDate();
    const bsYear = nd.getYear();
    const bsMonth = String(nd.getMonth() + 1).padStart(2, "0");
    const prefix = `${getScopePrefix(scope)}-${bsYear}${bsMonth}`;
    const row = await dbGet<{ count: number | string }>(
      sql`SELECT COUNT(*) as count FROM cases WHERE case_number LIKE ${`${prefix}%`}`,
    );
    const count = Number(row?.count ?? 0);
    return `${prefix}-${String(count + 1).padStart(3, "0")}`;
  },

  async getDailyNumber(date: string, scope: CaseScope = "ast"): Promise<number> {
    const scopePrefix = `${getScopePrefix(scope)}-%`;
    const row = await dbGet<{ count: number | string }>(
      sql`SELECT COUNT(*) as count FROM cases WHERE date = ${date} AND case_number LIKE ${scopePrefix}`,
    );
    return Number(row?.count ?? 0) + 1;
  },

  async getMonthlyNumber(yearMonth: string, scope: CaseScope = "ast"): Promise<number> {
    const scopePrefix = `${getScopePrefix(scope)}-%`;
    const row = await dbGet<{ count: number | string }>(
      sql`SELECT COUNT(*) as count FROM cases WHERE date LIKE ${`${yearMonth}%`} AND case_number LIKE ${scopePrefix}`,
    );
    return Number(row?.count ?? 0) + 1;
  },

  async getYearlyNumber(year: string, scope: CaseScope = "ast"): Promise<number> {
    const scopePrefix = `${getScopePrefix(scope)}-%`;
    const row = await dbGet<{ count: number | string }>(
      sql`SELECT COUNT(*) as count FROM cases WHERE date LIKE ${`${year}%`} AND case_number LIKE ${scopePrefix}`,
    );
    return Number(row?.count ?? 0) + 1;
  },
};
