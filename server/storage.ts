import {
  cases,
  users,
  downloadRequests,
  breakpoints,
  type Case,
  type InsertCase,
  type User,
  type Breakpoint,
  type InsertBreakpoint,
  type DownloadRequest,
  type SafeUser,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, like, gte, lte, or } from "drizzle-orm";
import NepaliDateImport from "nepali-date-converter";
// Handle both ESM default export and CJS module.exports
const NepaliDateClass = (NepaliDateImport as any).default || NepaliDateImport;
function getNepaliDateClass() {
  return NepaliDateClass;
}

function toSafeUser(user: User): SafeUser {
  const { passwordHash, ...safe } = user;
  return safe;
}

export interface IStorage {
  // Users
  createUser(data: { fullName: string; address: string; phone: string; email: string; designation: string; username: string; passwordHash: string; role: string; approved: boolean }): User;
  getUserByUsername(username: string): User | undefined;
  getUserByEmail(email: string): User | undefined;
  getUserById(id: number): User | undefined;
  getUsers(): User[];
  getPendingUsers(): User[];
  approveUser(id: number, role: string): User | undefined;
  rejectUser(id: number): void;
  updateUserRole(id: number, role: string): User | undefined;
  deleteUser(id: number): void;
  updateUser(id: number, data: Partial<User>): User | undefined; 

  // Download requests
  createDownloadRequest(data: { userId: number; dateFrom?: string | null; dateTo?: string | null; reason?: string | null }): DownloadRequest;
  getDownloadRequests(): DownloadRequest[];
  getPendingDownloadRequests(): DownloadRequest[];
  getDownloadRequestsByUser(userId: number): DownloadRequest[];
  resolveDownloadRequest(id: number, status: string, adminNote?: string): DownloadRequest | undefined;

  // Cases
  getCases(): Case[];
  getCase(id: number): Case | undefined;
  createCase(data: InsertCase): Case;
  updateCase(id: number, data: Partial<InsertCase>): Case | undefined;
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

export class DatabaseStorage implements IStorage {
  // ---- Users ----
  createUser(data: { fullName: string; address: string; phone: string; email: string; designation: string; username: string; passwordHash: string; role: string; approved: boolean }): User {
    return db
      .insert(users)
      .values({ ...data, createdAt: new Date().toISOString() })
      .returning()
      .get();
  }

  getUserByUsername(username: string): User | undefined {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  getUserByEmail(email: string): User | undefined {
    return db.select().from(users).where(eq(users.email, email)).get();
  }

  getUserById(id: number): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  getUsers(): User[] {
    return db.select().from(users).orderBy(desc(users.createdAt)).all();
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

  // ---- Cases ----
  getCases(): Case[] {
    return db.select().from(cases).orderBy(desc(cases.createdAt)).all();
  }

  getCase(id: number): Case | undefined {
    return db.select().from(cases).where(eq(cases.id, id)).get();
  }

  createCase(data: InsertCase): Case {
    return db
      .insert(cases)
      .values({ ...data, createdAt: new Date().toISOString() })
      .returning()
      .get();
  }

  updateCase(id: number, data: Partial<InsertCase>): Case | undefined {
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
