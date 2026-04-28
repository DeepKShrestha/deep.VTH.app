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
};

function toCase(row: CaseRow): Case {
  return {
    id: row.id,
    caseNumber: row.case_number,
    billNumber: row.bill_number,
    dailyNumber: row.daily_number,
    monthlyNumber: row.monthly_number,
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
  };
}

const CASE_SELECT = sql`SELECT id, case_number, bill_number, daily_number, monthly_number, date, date_ad, owner_name, owner_address, owner_phone, species, breed, animal_name, age, sex, sample_type, sample_date, sample_date_ad, culture_result, ast_results, remarks, registered_by, created_at, last_updated_by, last_updated_by_name, updated_at, custom_fields FROM cases`;

export const caseRepo = {
  async getCases(): Promise<Case[]> {
    const rows = await dbAll<CaseRow>(sql`${CASE_SELECT} ORDER BY created_at DESC`);
    return rows.map(toCase);
  },

  async getCasesPage(limit: number, offset: number): Promise<{ items: Case[]; total: number }> {
    const rows = await dbAll<CaseRow>(
      sql`${CASE_SELECT} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    );
    const totalRow = await dbGet<{ count: number | string }>(
      sql`SELECT COUNT(*) as count FROM cases`,
    );
    return {
      items: rows.map(toCase),
      total: Number(totalRow?.count ?? 0),
    };
  },

  async getCase(id: number): Promise<Case | undefined> {
    const row = await dbGet<CaseRow>(sql`${CASE_SELECT} WHERE id = ${id}`);
    return row ? toCase(row) : undefined;
  },

  async createCase(
    data: InsertCase &
      Partial<Pick<Case, "lastUpdatedBy" | "lastUpdatedByName" | "updatedAt">>,
  ): Promise<Case> {
    await dbRun(
      sql`INSERT INTO cases
          (case_number, bill_number, daily_number, monthly_number, date, date_ad, owner_name, owner_address, owner_phone, species, breed, animal_name, age, sex, sample_type, sample_date, sample_date_ad, culture_result, ast_results, remarks, registered_by, created_at, last_updated_by, last_updated_by_name, updated_at, custom_fields)
          VALUES (
            ${data.caseNumber},
            ${data.billNumber ?? null},
            ${data.dailyNumber ?? null},
            ${data.monthlyNumber ?? null},
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
            ${data.customFields ?? null}
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
  ): Promise<Case | undefined> {
    const existing = await this.getCase(id);
    if (!existing) return undefined;
    const next = { ...existing, ...patch };
    await dbRun(
      sql`UPDATE cases
          SET case_number = ${next.caseNumber},
              bill_number = ${next.billNumber ?? null},
              daily_number = ${next.dailyNumber ?? null},
              monthly_number = ${next.monthlyNumber ?? null},
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
              custom_fields = ${next.customFields ?? null}
          WHERE id = ${id}`,
    );
    return this.getCase(id);
  },

  async deleteCase(id: number): Promise<void> {
    await dbRun(sql`DELETE FROM cases WHERE id = ${id}`);
  },

  async getCasesByDateRange(dateFrom?: string, dateTo?: string): Promise<Case[]> {
    let rows = await dbAll<CaseRow>(sql`${CASE_SELECT} ORDER BY created_at DESC`);
    if (dateFrom) rows = rows.filter((c) => c.date >= dateFrom);
    if (dateTo) rows = rows.filter((c) => c.date <= dateTo);
    return rows.map(toCase);
  },

  async getNextCaseNumber(): Promise<string> {
    const NepaliDate = getNepaliDateClass();
    const nd = new NepaliDate();
    const bsYear = nd.getYear();
    const bsMonth = String(nd.getMonth() + 1).padStart(2, "0");
    const prefix = `AST-${bsYear}${bsMonth}`;
    const row = await dbGet<{ count: number | string }>(
      sql`SELECT COUNT(*) as count FROM cases WHERE case_number LIKE ${`${prefix}%`}`,
    );
    const count = Number(row?.count ?? 0);
    return `${prefix}-${String(count + 1).padStart(3, "0")}`;
  },

  async getDailyNumber(date: string): Promise<number> {
    const row = await dbGet<{ count: number | string }>(
      sql`SELECT COUNT(*) as count FROM cases WHERE date = ${date}`,
    );
    return Number(row?.count ?? 0) + 1;
  },

  async getMonthlyNumber(yearMonth: string): Promise<number> {
    const row = await dbGet<{ count: number | string }>(
      sql`SELECT COUNT(*) as count FROM cases WHERE date LIKE ${`${yearMonth}%`}`,
    );
    return Number(row?.count ?? 0) + 1;
  },
};
