import {
  cases,
  users,
  downloadRequests,
  passwordResetRequests,
  breakpoints,
  type Case,
  type InsertCase,
  type User,
  type Breakpoint,
  type InsertBreakpoint,
  type DownloadRequest,
  type PasswordResetRequest,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, like, gte, lte, or } from "drizzle-orm";
import NepaliDateImport from "nepali-date-converter";
import { sql } from "drizzle-orm";
// Handle both ESM default export and CJS module.exports
const NepaliDateClass = (NepaliDateImport as any).default || NepaliDateImport;
function getNepaliDateClass() {
  return NepaliDateClass;
}

interface IStorage {
  // Users
  createUser(data: {
    fullName: string;
    address: string;
    phone: string;
    email: string;
    designation: string;
    studentBatch?: number | null;
    username: string;
    passwordHash: string;
    role: string;
    approved: boolean;
    profilePhotoPath?: string | null;
  }): User;
  getUserByUsername(username: string): User | undefined;
  getUserByEmail(email: string): User | undefined;
  getUserById(id: number): User | undefined;
  getUsers(): User[];
  getUsersPage(limit: number, offset: number, approved?: boolean): {
    items: User[];
    total: number;
  };
  getPendingUsers(): User[];
  approveUser(id: number, role: string): User | undefined;
  rejectUser(id: number): void;
  updateUserRole(id: number, role: string): User | undefined;
  deleteUser(id: number): void;
  updateUser(id: number, data: Partial<User>): User | undefined; 

  // Download requests
  createDownloadRequest(data: { userId: number; dateFrom?: string | null; dateTo?: string | null; reason?: string | null }): DownloadRequest;
  getDownloadRequests(): DownloadRequest[];
  getDownloadRequestsPage(limit: number, offset: number): {
    items: DownloadRequest[];
    total: number;
  };
  getPendingDownloadRequests(): DownloadRequest[];
  getDownloadRequestsByUser(userId: number): DownloadRequest[];
  resolveDownloadRequest(id: number, status: string, adminNote?: string): DownloadRequest | undefined;
  createPasswordResetRequest(data: {
    userId: number;
    requestedByRole: string;
    passwordHash: string;
    reason?: string | null;
    idCardFilename?: string | null;
  }): PasswordResetRequest;
  getPendingPasswordResetRequestsByUser(userId: number): PasswordResetRequest[];
  setPasswordResetRequestIdCard(id: number, idCardFilename: string | null): PasswordResetRequest | undefined;
  clearPasswordResetRequestIdCard(id: number): PasswordResetRequest | undefined;
  getPasswordResetRequests(): PasswordResetRequest[];
  getPasswordResetRequestsPage(limit: number, offset: number): {
    items: PasswordResetRequest[];
    total: number;
  };
  resolvePasswordResetRequest(id: number, status: string, resolvedBy: number, resolverNote?: string): PasswordResetRequest | undefined;

  // Cases
  getCases(): Case[];
  getCasesPage(limit: number, offset: number): { items: Case[]; total: number };
  getCase(id: number): Case | undefined;
  createCase(data: InsertCase & Partial<Pick<Case, "lastUpdatedBy" | "lastUpdatedByName" | "updatedAt">>): Case;
  updateCase(id: number, data: Partial<InsertCase> & Partial<Pick<Case, "lastUpdatedBy" | "lastUpdatedByName" | "updatedAt">>): Case | undefined;
  deleteCase(id: number): void;
  getNextCaseNumber(): string;
  getDailyNumber(date: string): number;
  getMonthlyNumber(yearMonth: string): number;
  getCasesByDateRange(dateFrom?: string, dateTo?: string): Case[];

  // Breakpoints
  getBreakpoints(): Breakpoint[];
  getBreakpoint(id: number): Breakpoint | undefined;
  createBreakpoint(data: InsertBreakpoint): Breakpoint;
  updateBreakpoint(id: number, data: Partial<InsertBreakpoint>): Breakpoint | undefined;
  deleteBreakpoint(id: number): void;
}

class DatabaseStorage implements IStorage {
  // ---- Users ----
  createUser(data: {
    fullName: string;
    address: string;
    phone: string;
    email: string;
    designation: string;
    studentBatch?: number | null;
    username: string;
    passwordHash: string;
    role: string;
    approved: boolean;
    profilePhotoPath?: string | null;
  }): User {
    return db
      .insert(users)
      .values({
        ...data,
        profilePhotoPath: data.profilePhotoPath ?? null,
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get();
  }

  getUserByUsername(username: string): User | undefined {
    const normalized = username.trim().toLowerCase();
    if (!normalized) return undefined;
    return db
      .select()
      .from(users)
      .where(sql`LOWER(${users.username}) = ${normalized}`)
      .limit(1)
      .get();
  }

  getUserByEmail(email: string): User | undefined {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return undefined;
    return db
      .select()
      .from(users)
      .where(sql`LOWER(${users.email}) = ${normalized}`)
      .limit(1)
      .get();
  }

  getUserById(id: number): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  getUsers(): User[] {
    return db.select().from(users).orderBy(desc(users.createdAt)).all();
  }

  getUsersPage(limit: number, offset: number, approved?: boolean): {
    items: User[];
    total: number;
  } {
    const whereClause =
      typeof approved === "boolean" ? eq(users.approved, approved) : undefined;

    const items = whereClause
      ? db
          .select()
          .from(users)
          .where(whereClause)
          .orderBy(desc(users.createdAt))
          .limit(limit)
          .offset(offset)
          .all()
      : db
          .select()
          .from(users)
          .orderBy(desc(users.createdAt))
          .limit(limit)
          .offset(offset)
          .all();

    const totalRow = whereClause
      ? db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(whereClause)
          .get()
      : db.select({ count: sql<number>`count(*)` }).from(users).get();

    return { items, total: Number(totalRow?.count ?? 0) };
  }

  getPendingUsers(): User[] {
    return db.select().from(users).where(eq(users.approved, false)).all();
  }

  approveUser(id: number, role: string): User | undefined {
    const existing = this.getUserById(id);
    if (!existing) return undefined;
    return db
      .update(users)
      .set({ approved: true, role })
      .where(eq(users.id, id))
      .returning()
      .get();
  }

  rejectUser(id: number): void {
    db.delete(users).where(eq(users.id, id)).run();
  }

  updateUserRole(id: number, role: string): User | undefined {
    const existing = this.getUserById(id);
    if (!existing) return undefined;
    return db
      .update(users)
      .set({ role })
      .where(eq(users.id, id))
      .returning()
      .get();
  }

  deleteUser(id: number): void {
    db.delete(users).where(eq(users.id, id)).run();
  }

    updateUser(id: number, data: Partial<User>): User | undefined {
    const existing = this.getUserById(id);
    if (!existing) return undefined;

    return db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning()
      .get();
  }


  // ---- Download Requests ----
  createDownloadRequest(data: { userId: number; dateFrom?: string | null; dateTo?: string | null; reason?: string | null }): DownloadRequest {
    return db
      .insert(downloadRequests)
      .values({ ...data, status: "pending", createdAt: new Date().toISOString() })
      .returning()
      .get();
  }

  getDownloadRequests(): DownloadRequest[] {
    return db.select().from(downloadRequests).orderBy(desc(downloadRequests.createdAt)).all();
  }

  getDownloadRequestsPage(limit: number, offset: number): {
    items: DownloadRequest[];
    total: number;
  } {
    const items = db
      .select()
      .from(downloadRequests)
      .orderBy(desc(downloadRequests.createdAt))
      .limit(limit)
      .offset(offset)
      .all();
    const totalRow = db
      .select({ count: sql<number>`count(*)` })
      .from(downloadRequests)
      .get();
    return { items, total: Number(totalRow?.count ?? 0) };
  }

  getPendingDownloadRequests(): DownloadRequest[] {
    return db.select().from(downloadRequests).where(eq(downloadRequests.status, "pending")).all();
  }

  getDownloadRequestsByUser(userId: number): DownloadRequest[] {
    return db.select().from(downloadRequests).where(eq(downloadRequests.userId, userId)).orderBy(desc(downloadRequests.createdAt)).all();
  }

  resolveDownloadRequest(id: number, status: string, adminNote?: string): DownloadRequest | undefined {
    const existing = db.select().from(downloadRequests).where(eq(downloadRequests.id, id)).get();
    if (!existing) return undefined;
    return db
      .update(downloadRequests)
      .set({ status, adminNote: adminNote || null, resolvedAt: new Date().toISOString() })
      .where(eq(downloadRequests.id, id))
      .returning()
      .get();
  }

  createPasswordResetRequest(data: {
    userId: number;
    requestedByRole: string;
    passwordHash: string;
    reason?: string | null;
    idCardFilename?: string | null;
  }): PasswordResetRequest {
    return db
      .insert(passwordResetRequests)
      .values({
        userId: data.userId,
        requestedByRole: data.requestedByRole,
        passwordHash: data.passwordHash,
        reason: data.reason || null,
        idCardFilename: data.idCardFilename ?? null,
        status: "pending",
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get();
  }

  getPendingPasswordResetRequestsByUser(userId: number): PasswordResetRequest[] {
    return db
      .select()
      .from(passwordResetRequests)
      .where(
        and(
          eq(passwordResetRequests.userId, userId),
          eq(passwordResetRequests.status, "pending"),
        ),
      )
      .all();
  }

  setPasswordResetRequestIdCard(
    id: number,
    idCardFilename: string | null,
  ): PasswordResetRequest | undefined {
    return db
      .update(passwordResetRequests)
      .set({ idCardFilename })
      .where(eq(passwordResetRequests.id, id))
      .returning()
      .get();
  }

  clearPasswordResetRequestIdCard(id: number): PasswordResetRequest | undefined {
    return db
      .update(passwordResetRequests)
      .set({ idCardFilename: null })
      .where(eq(passwordResetRequests.id, id))
      .returning()
      .get();
  }

  getPasswordResetRequests(): PasswordResetRequest[] {
    return db
      .select()
      .from(passwordResetRequests)
      .orderBy(desc(passwordResetRequests.createdAt))
      .all();
  }

  getPasswordResetRequestsPage(limit: number, offset: number): {
    items: PasswordResetRequest[];
    total: number;
  } {
    const items = db
      .select()
      .from(passwordResetRequests)
      .orderBy(desc(passwordResetRequests.createdAt))
      .limit(limit)
      .offset(offset)
      .all();
    const totalRow = db
      .select({ count: sql<number>`count(*)` })
      .from(passwordResetRequests)
      .get();
    return { items, total: Number(totalRow?.count ?? 0) };
  }

  resolvePasswordResetRequest(
    id: number,
    status: string,
    resolvedBy: number,
    resolverNote?: string,
  ): PasswordResetRequest | undefined {
    const existing = db
      .select()
      .from(passwordResetRequests)
      .where(eq(passwordResetRequests.id, id))
      .get();
    if (!existing) return undefined;

    return db
      .update(passwordResetRequests)
      .set({
        status,
        resolvedBy,
        resolverNote: resolverNote || null,
        idCardFilename: null,
        resolvedAt: new Date().toISOString(),
      })
      .where(eq(passwordResetRequests.id, id))
      .returning()
      .get();
  }

  // ---- Cases ----
  getCases(): Case[] {
    return db.select().from(cases).orderBy(desc(cases.createdAt)).all();
  }

  getCasesPage(limit: number, offset: number): { items: Case[]; total: number } {
    const items = db
      .select()
      .from(cases)
      .orderBy(desc(cases.createdAt))
      .limit(limit)
      .offset(offset)
      .all();
    const totalRow = db.select({ count: sql<number>`count(*)` }).from(cases).get();
    return { items, total: Number(totalRow?.count ?? 0) };
  }

  getCase(id: number): Case | undefined {
    return db.select().from(cases).where(eq(cases.id, id)).get();
  }

  createCase(
    data: InsertCase &
      Partial<Pick<Case, "lastUpdatedBy" | "lastUpdatedByName" | "updatedAt">>
  ): Case {
    return db
      .insert(cases)
      .values({ ...data, createdAt: new Date().toISOString() })
      .returning()
      .get();
  }

  updateCase(
    id: number,
    data: Partial<InsertCase> &
      Partial<Pick<Case, "lastUpdatedBy" | "lastUpdatedByName" | "updatedAt">>
  ): Case | undefined {
    const existing = this.getCase(id);
    if (!existing) return undefined;
    return db
      .update(cases)
      .set(data)
      .where(eq(cases.id, id))
      .returning()
      .get();
  }

  deleteCase(id: number): void {
    db.delete(cases).where(eq(cases.id, id)).run();
  }

  getNextCaseNumber(): string {
    const NepaliDate = getNepaliDateClass();
    const nd = new NepaliDate();
    const bsYear = nd.getYear();
    const bsMonth = String(nd.getMonth() + 1).padStart(2, "0");
    const allCases = db.select().from(cases).all();
    const prefix = `AST-${bsYear}${bsMonth}`;
    const count = allCases.filter((c) => c.caseNumber.startsWith(prefix)).length;
    return `${prefix}-${String(count + 1).padStart(3, "0")}`;
  }

  getDailyNumber(date: string): number {
    const allCases = db.select().from(cases).all();
    return allCases.filter((c) => c.date === date).length + 1;
  }

  getMonthlyNumber(yearMonth: string): number {
    const allCases = db.select().from(cases).all();
    return allCases.filter((c) => c.date.startsWith(yearMonth)).length + 1;
  }

  getCasesByDateRange(dateFrom?: string, dateTo?: string): Case[] {
    const allCases = db.select().from(cases).orderBy(desc(cases.createdAt)).all();
    return allCases.filter((c) => {
      if (dateFrom && c.date < dateFrom) return false;
      if (dateTo && c.date > dateTo) return false;
      return true;
    });
  }

  // ---- Breakpoints ----
  getBreakpoints(): Breakpoint[] {
    return db.select().from(breakpoints).all();
  }

  getBreakpoint(id: number): Breakpoint | undefined {
    return db.select().from(breakpoints).where(eq(breakpoints.id, id)).get();
  }

  createBreakpoint(data: InsertBreakpoint): Breakpoint {
    return db.insert(breakpoints).values(data).returning().get();
  }

  updateBreakpoint(
    id: number,
    data: Partial<InsertBreakpoint>
  ): Breakpoint | undefined {
    const existing = this.getBreakpoint(id);
    if (!existing) return undefined;
    return db
      .update(breakpoints)
      .set(data)
      .where(eq(breakpoints.id, id))
      .returning()
      .get();
  }

  deleteBreakpoint(id: number): void {
    db.delete(breakpoints).where(eq(breakpoints.id, id)).run();
  }
}

export const storage = new DatabaseStorage();
