import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertCaseSchema, insertBreakpointSchema, insertUserSchema } from "@shared/schema";
import { db } from "./db";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import NepaliDateImport from "nepali-date-converter";

const NepaliDateClass = (NepaliDateImport as any).default || NepaliDateImport;
function getNepaliDateClass() {
  return NepaliDateClass;
}

function getTodayBs(): string {
  const NepaliDate = getNepaliDateClass();
  const nd = new NepaliDate();
  return nd.format("YYYY-MM-DD");
}

// Simple in-memory session store (tokens → userId)
const sessions = new Map<string, number>();

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "";
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// Middleware to extract current user from Authorization header
function getCurrentUser(req: Request): { id: number; role: string; approved: boolean; designation: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.substring(7);
  const userId = sessions.get(token);
  if (!userId) return null;
  const user = storage.getUserById(userId);
  if (!user) return null;
  return { id: user.id, role: user.role, approved: user.approved, designation: user.designation };
}

// Auth middleware - requires login
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  if (!user.approved) return res.status(403).json({ message: "Account not yet approved" });
  (req as any).currentUser = user;
  next();
}

// Role middleware - requires specific roles
function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).currentUser;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    if (!roles.includes(user.role)) return res.status(403).json({ message: "Insufficient permissions" });
    next();
  };
}

// Helper to check admin-level roles
function isAdminRole(role: string): boolean {
  return role === "superadmin" || role === "admin";
}

// Can register cases: superadmin, admin, staff (vet, lab_assistant, intern)
function canRegister(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).currentUser;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  if (isAdminRole(user.role) || user.role === "staff") return next();
  return res.status(403).json({ message: "Students cannot register cases" });
}

// Can download: superadmin, admin, staff. Students need approved request.
function canDownload(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).currentUser;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  if (isAdminRole(user.role) || user.role === "staff") return next();
  // Students need an approved download request
  const requests = storage.getDownloadRequestsByUser(user.id);
  const hasApproved = requests.some((r) => r.status === "approved");
  if (hasApproved) return next();
  return res.status(403).json({ message: "Download access not approved. Please submit a download request." });
}

const SEED_BREAKPOINTS = [
  { antibiotic: "Amikacin", symbol: "AK", content: "30 µg", sensitiveMin: 17, intermediateLow: 15, intermediateHigh: 16, resistantMax: 14, primaryTargets: "Gram-negative bacilli (e.g., Pseudomonas spp.)" },
  { antibiotic: "Amoxicillin", symbol: "AML", content: "25 µg", sensitiveMin: 19, intermediateLow: 16, intermediateHigh: 18, resistantMax: 15, primaryTargets: "Enterobacteriaceae, Streptococci" },
  { antibiotic: "Amoxicillin", symbol: "AML", content: "10 µg", sensitiveMin: 17, intermediateLow: 14, intermediateHigh: 16, resistantMax: 13, primaryTargets: "Enterobacteriaceae, Streptococci" },
  { antibiotic: "Azithromycin", symbol: "AZM", content: "15 µg", sensitiveMin: 18, intermediateLow: 14, intermediateHigh: 17, resistantMax: 13, primaryTargets: "Respiratory pathogens" },
  { antibiotic: "Azithromycin (S. typhi)", symbol: "AZM", content: "15 µg", sensitiveMin: 13, intermediateLow: null, intermediateHigh: null, resistantMax: 12, primaryTargets: "Salmonella typhi" },
  { antibiotic: "Cefalexin", symbol: "LEX", content: "30 µg", sensitiveMin: 18, intermediateLow: 15, intermediateHigh: 17, resistantMax: 14, primaryTargets: "Staphylococci" },
  { antibiotic: "Chloramphenicol", symbol: "C", content: "30 µg", sensitiveMin: 18, intermediateLow: 13, intermediateHigh: 17, resistantMax: 12, primaryTargets: "Anaerobes, Actinobacillus spp." },
  { antibiotic: "Ciprofloxacin", symbol: "CIP", content: "5 µg", sensitiveMin: 25, intermediateLow: 22, intermediateHigh: 24, resistantMax: 21, primaryTargets: "Enterobacteriaceae" },
  { antibiotic: "Doxycycline", symbol: "DO", content: "30 µg", sensitiveMin: 16, intermediateLow: 13, intermediateHigh: 15, resistantMax: 12, primaryTargets: "Pasteurella spp., E. coli" },
  { antibiotic: "Enrofloxacin", symbol: "ENR", content: "5 µg", sensitiveMin: 22, intermediateLow: 18, intermediateHigh: 21, resistantMax: 17, primaryTargets: "Enterobacteriaceae" },
  { antibiotic: "Enrofloxacin", symbol: "ENR", content: "10 µg", sensitiveMin: 25, intermediateLow: 21, intermediateHigh: 24, resistantMax: 20, primaryTargets: "Pseudomonas spp." },
  { antibiotic: "Florfenicol", symbol: "FFC", content: "30 µg", sensitiveMin: 19, intermediateLow: 16, intermediateHigh: 18, resistantMax: 15, primaryTargets: "BRD pathogens (e.g. Mannheimia haemolytica)" },
  { antibiotic: "Gentamicin", symbol: "GEN", content: "10 µg", sensitiveMin: 15, intermediateLow: 13, intermediateHigh: 14, resistantMax: 12, primaryTargets: "Gram-negative bacilli" },
  { antibiotic: "Levofloxacin", symbol: "LEV", content: "5 µg", sensitiveMin: 20, intermediateLow: 17, intermediateHigh: 19, resistantMax: 16, primaryTargets: "Respiratory & UTI pathogens" },
  { antibiotic: "Neomycin", symbol: "N", content: "30 µg", sensitiveMin: 17, intermediateLow: 14, intermediateHigh: 16, resistantMax: 13, primaryTargets: "Enterobacteriaceae" },
  { antibiotic: "Tetracycline", symbol: "TE", content: "30 µg", sensitiveMin: 15, intermediateLow: 12, intermediateHigh: 14, resistantMax: 11, primaryTargets: "Broad-spectrum" },
  { antibiotic: "Trimethoprim", symbol: "TR", content: "5 µg", sensitiveMin: 16, intermediateLow: 11, intermediateHigh: 15, resistantMax: 10, primaryTargets: "Urinary pathogens" },
];

export async function registerRoutes(httpServer: Server, app: Express) {
  // Create tables
  db.run(sql`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    designation TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'pending',
    approved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS download_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    date_from TEXT,
    date_to TEXT,
    reason TEXT,
    admin_note TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_number TEXT NOT NULL,
  bill_number TEXT,
  daily_number INTEGER,
  monthly_number INTEGER,
  date TEXT NOT NULL,
  date_ad TEXT,
  owner_name TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  owner_phone TEXT NOT NULL,
  species TEXT NOT NULL,
  breed TEXT NOT NULL,
  animal_name TEXT,
  age TEXT,
  sex TEXT,
  sample_type TEXT,
  sample_date TEXT,
  sample_date_ad TEXT,
  culture_result TEXT,
  ast_results TEXT,
  remarks TEXT,
  registered_by INTEGER,
  created_at TEXT NOT NULL,
  last_updated_by INTEGER,
  updated_at TEXT
)`);

  db.run(sql`CREATE TABLE IF NOT EXISTS breakpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    antibiotic TEXT NOT NULL,
    symbol TEXT NOT NULL,
    content TEXT NOT NULL,
    sensitive_min INTEGER NOT NULL,
    intermediate_low INTEGER,
    intermediate_high INTEGER,
    resistant_max INTEGER NOT NULL,
    primary_targets TEXT
  )`);

  // Seed breakpoints if empty
  const existingBps = storage.getBreakpoints();
  if (existingBps.length === 0) {
    for (const bp of SEED_BREAKPOINTS) {
      storage.createBreakpoint(bp);
    }
  }

  // Seed super admin if no users exist
  const existingUsers = storage.getUsers();
  if (existingUsers.length === 0) {
    const hash = bcrypt.hashSync("admin123", 10);
    storage.createUser({
      fullName: "Super Admin",
      address: "VTH",
      phone: "0000000000",
      email: "admin@vth.edu.np",
      designation: "veterinarian",
      username: "admin",
      passwordHash: hash,
      role: "superadmin",
      approved: true,
    });
  } else {
    // Ensure at least one superadmin exists (upgrade existing "admin" seed user)
    const hasSuperAdmin = existingUsers.some((u) => u.role === "superadmin");
    if (!hasSuperAdmin) {
      const adminUser = existingUsers.find((u) => u.username === "admin" && u.role === "admin");
      if (adminUser) {
        storage.updateUserRole(adminUser.id, "superadmin");
      }
    }
  }

  // ===================== AUTH ROUTES =====================

  app.post("/api/auth/signup", (req, res) => {
    const parsed = insertUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
    }

    const { password, ...userData } = parsed.data;

    // Check if username or email already exists
    if (storage.getUserByUsername(userData.username)) {
      return res.status(409).json({ message: "Username already taken" });
    }
    if (storage.getUserByEmail(userData.email)) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    // Determine role from designation
    const role = userData.designation === "student" ? "student" : "staff";

    const user = storage.createUser({
      ...userData,
      passwordHash,
      role,
      approved: false, // requires admin approval
    });

    const { passwordHash: _, ...safeUser } = user;
    res.status(201).json({ message: "Account created. Waiting for admin approval.", user: safeUser });
  });

  app.post("/api/auth/login", (req, res) => {
    const { usernameOrEmail, password } = req.body;
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ message: "Username/email and password required" });
    }

    // Find user by username or email
    let user = storage.getUserByUsername(usernameOrEmail);
    if (!user) user = storage.getUserByEmail(usernameOrEmail);
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    if (!bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.approved) {
      return res.status(403).json({ message: "Your account is pending admin approval" });
    }

    const token = generateToken();
    sessions.set(token, user.id);

    const { passwordHash: _, ...safeUser } = user;
    res.json({ token, user: safeUser });
  });

  app.post("/api/auth/logout", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      sessions.delete(authHeader.substring(7));
    }
    res.json({ message: "Logged out" });
  });

  app.get("/api/auth/me", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const token = authHeader.substring(7);
    const userId = sessions.get(token);
    if (!userId) return res.status(401).json({ message: "Session expired" });
    const user = storage.getUserById(userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    const { passwordHash: _, ...safeUser } = user;
    res.json(safeUser);
  });

    // ===================== USER SELF PROFILE ROUTE =====================

  app.patch("/api/users/me", requireAuth, (req, res) => {
    const currentUser = (req as any).currentUser as {
      id: number;
      role: string;
      approved: boolean;
      designation: string;
    };

    const user = storage.getUserById(currentUser.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const {
      fullName,
      address,
      phone,
      currentPassword,
      newPassword,
    } = req.body as {
      fullName?: string;
      address?: string;
      phone?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    const updates: any = {};

    if (typeof fullName === "string" && fullName.trim()) {
      updates.fullName = fullName.trim();
    }

    if (typeof address === "string" && address.trim()) {
      updates.address = address.trim();
    }

    if (typeof phone === "string" && phone.trim()) {
      updates.phone = phone.trim();
    }

    // Optional password change
    if (newPassword || currentPassword) {
      if (!currentPassword || !newPassword) {
        return res
          .status(400)
          .json({ message: "Current and new password are required" });
      }

      if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
        return res
          .status(400)
          .json({ message: "Current password is incorrect" });
      }

      if (newPassword.length < 6) {
        return res
          .status(400)
          .json({ message: "New password must be at least 6 characters" });
      }

      const hash = bcrypt.hashSync(newPassword, 10);
      updates.passwordHash = hash;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No changes provided" });
    }

    const updated = storage.updateUser(currentUser.id, updates);
    if (!updated) {
      return res.status(500).json({ message: "Failed to update user" });
    }

    const { passwordHash: _, ...safeUser } = updated;
    return res.json({ success: true, user: safeUser });
  });

  // ===================== ADMIN ROUTES =====================

  // Get all users
  app.get("/api/admin/users", requireAuth, requireRole("superadmin", "admin"), (_req, res) => {
    const allUsers = storage.getUsers();
    const safeUsers = allUsers.map(({ passwordHash, ...u }) => u);
    res.json(safeUsers);
  });

  // Get pending users
  app.get("/api/admin/users/pending", requireAuth, requireRole("superadmin", "admin"), (_req, res) => {
    const pending = storage.getPendingUsers();
    const safeUsers = pending.map(({ passwordHash, ...u }) => u);
    res.json(safeUsers);
  });

  // Approve user
  app.post("/api/admin/users/:id/approve", requireAuth, requireRole("superadmin", "admin"), (req, res) => {
    const { role } = req.body; // admin can override role
    const user = storage.approveUser(parseInt(req.params.id), role || "staff");
    if (!user) return res.status(404).json({ message: "User not found" });
    const { passwordHash: _, ...safeUser } = user;
    res.json(safeUser);
  });

  // Reject (delete) user — admins cannot delete other admins/superadmins, only superadmin can
  app.delete("/api/admin/users/:id", requireAuth, requireRole("superadmin", "admin"), (req, res) => {
    const currentUser = (req as any).currentUser;
    const targetUser = storage.getUserById(parseInt(req.params.id));
    if (!targetUser) return res.status(404).json({ message: "User not found" });
    // Prevent deleting yourself
    if (targetUser.id === currentUser.id) return res.status(403).json({ message: "Cannot delete your own account" });
    // Only superadmin can delete admins
    if (isAdminRole(targetUser.role) && currentUser.role !== "superadmin") {
      return res.status(403).json({ message: "Only Super Admin can remove admins" });
    }
    storage.rejectUser(parseInt(req.params.id));
    res.json({ message: "User removed" });
  });

  // Update user role — only superadmin can promote/demote admin roles
  app.patch("/api/admin/users/:id/role", requireAuth, requireRole("superadmin", "admin"), (req, res) => {
    const currentUser = (req as any).currentUser;
    const { role } = req.body;
    const targetUser = storage.getUserById(parseInt(req.params.id));
    if (!targetUser) return res.status(404).json({ message: "User not found" });
    // Prevent changing own role
    if (targetUser.id === currentUser.id) return res.status(403).json({ message: "Cannot change your own role" });
    // Only superadmin can assign/remove admin or superadmin roles
    if ((isAdminRole(role) || isAdminRole(targetUser.role)) && currentUser.role !== "superadmin") {
      return res.status(403).json({ message: "Only Super Admin can assign or modify admin roles" });
    }
    const user = storage.updateUserRole(parseInt(req.params.id), role);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { passwordHash: _, ...safeUser } = user;
    res.json(safeUser);
  });

  // Edit user details (superadmin only)
  app.patch("/api/admin/users/:id", requireAuth, requireRole("superadmin"), (req, res) => {
    const targetUser = storage.getUserById(parseInt(req.params.id));
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    const {
      fullName,
      address,
      phone,
      email,
      username,
      designation,
    } = req.body as {
      fullName?: string;
      address?: string;
      phone?: string;
      email?: string;
      username?: string;
      designation?: string;
    };

    const updates: any = {};

    if (typeof fullName === "string" && fullName.trim()) {
      updates.fullName = fullName.trim();
    }
    if (typeof address === "string" && address.trim()) {
      updates.address = address.trim();
    }
    if (typeof phone === "string" && phone.trim()) {
      updates.phone = phone.trim();
    }
    if (typeof email === "string" && email.trim()) {
      updates.email = email.trim();
    }
    if (typeof username === "string" && username.trim()) {
      updates.username = username.trim();
    }
    if (typeof designation === "string" && designation.trim()) {
      updates.designation = designation.trim();
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No changes provided" });
    }

    const updated = storage.updateUser(parseInt(req.params.id), updates);
    if (!updated) return res.status(500).json({ message: "Failed to update user" });

    const { passwordHash: _, ...safeUser } = updated;
    res.json(safeUser);
  });

  // Get all download requests (admin)
  app.get("/api/admin/download-requests", requireAuth, requireRole("superadmin", "admin"), (_req, res) => {
    const requests = storage.getDownloadRequests();
    // Enrich with user info
    const enriched = requests.map((r) => {
      const user = storage.getUserById(r.userId);
      return { ...r, userName: user?.fullName || "Unknown", userDesignation: user?.designation || "" };
    });
    res.json(enriched);
  });

  // Resolve download request (approve/reject)
  app.post("/api/admin/download-requests/:id/resolve", requireAuth, requireRole("superadmin", "admin"), (req, res) => {
    const { status, adminNote } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be approved or rejected" });
    }
    const result = storage.resolveDownloadRequest(parseInt(req.params.id), status, adminNote);
    if (!result) return res.status(404).json({ message: "Request not found" });
    res.json(result);
  });

  // ===================== DOWNLOAD REQUESTS (for students) =====================

  app.post("/api/download-requests", requireAuth, (req: Request, res: Response) => {
    const user = (req as any).currentUser;
    const { dateFrom, dateTo, reason } = req.body;
    const request = storage.createDownloadRequest({
      userId: user.id,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      reason: reason || null,
    });
    res.status(201).json(request);
  });

  app.get("/api/download-requests/mine", requireAuth, (req: Request, res: Response) => {
    const user = (req as any).currentUser;
    res.json(storage.getDownloadRequestsByUser(user.id));
  });

  // ===================== CASE ROUTES =====================

  app.get("/api/cases", requireAuth, (_req, res) => {
    res.json(storage.getCases());
  });

  app.get("/api/cases/:id", requireAuth, (req, res) => {
    const caseData = storage.getCase(parseInt(req.params.id));
    if (!caseData) return res.status(404).json({ message: "Case not found" });
    res.json(caseData);
  });

  app.get("/api/next-case-info", requireAuth, canRegister, (_req, res) => {
    const todayBs = getTodayBs();
    const bsYearMonth = todayBs.substring(0, 7);
    res.json({
      caseNumber: storage.getNextCaseNumber(),
      dailyNumber: storage.getDailyNumber(todayBs),
      monthlyNumber: storage.getMonthlyNumber(bsYearMonth),
      todayBs,
      todayAd: new Date().toISOString().split("T")[0],
    });
  });

        app.post("/api/cases", requireAuth, canRegister, (req: Request, res: Response) => {
  const user = (req as any).currentUser;
  const now = new Date().toISOString();
  const fullUser = storage.getUserById(user.id);

  const parsed = insertCaseSchema.safeParse({
    ...req.body,
    registeredBy: user.id,
  });

  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Invalid data", errors: parsed.error.flatten() });
  }

  const newCase = storage.createCase({
    ...parsed.data,
    createdAt: now,
    lastUpdatedBy: user.id,
    lastUpdatedByName: fullUser?.fullName || `User ${user.id}`,
    updatedAt: now,
  });

  res.status(201).json(newCase);
});

  // NEW: update case and track who edited it
app.patch("/api/cases/:id", requireAuth, canRegister, (req, res) => {
  const user = (req as any).currentUser;
  const now = new Date().toISOString();
  const fullUser = storage.getUserById(user.id);

  const updated = storage.updateCase(parseInt(req.params.id, 10), {
    ...req.body,
    lastUpdatedBy: user.id,
    lastUpdatedByName: fullUser?.fullName || `User ${user.id}`,
    updatedAt: now,
  });

  if (!updated) {
    return res.status(404).json({ message: "Case not found" });
  }

  res.json(updated);
});

  app.delete("/api/cases/:id", requireAuth, requireRole("superadmin", "admin"), (req, res) => {
    const existing = storage.getCase(parseInt(req.params.id));
    if (!existing) return res.status(404).json({ message: "Case not found" });
    storage.deleteCase(parseInt(req.params.id));
    res.json({ message: "Case deleted" });
  });

  // ===================== EXPORT ROUTES =====================

  app.get("/api/export/cases", requireAuth, canDownload, (req: Request, res: Response) => {
    const { dateFrom, dateTo, format } = req.query as { dateFrom?: string; dateTo?: string; format?: string };
    const casesData = storage.getCasesByDateRange(dateFrom, dateTo);

    // Flatten cases for export
    const rows = casesData.map((c) => {
      let astData: any[] = [];
      try { astData = JSON.parse(c.astResults || "[]"); } catch {}

      const antibiotics = astData.map((a: any) => `${a.antibiotic} (${a.symbol})`).join("; ");
      const zoneSizes = astData.map((a: any) => a.zoneSize).join("; ");
      const sensitivities = astData.map((a: any) => a.sensitivity).join("; ");

      return {
        "Case No": c.caseNumber,
        "Bill No": c.billNumber || "",
        "Date (BS)": c.date,
        "Date (AD)": c.dateAd || "",
        "Daily #": c.dailyNumber || "",
        "Monthly #": c.monthlyNumber || "",
        "Owner Name": c.ownerName,
        "Address": c.ownerAddress,
        "Phone": c.ownerPhone,
        "Species": c.species,
        "Breed": c.breed,
        "Animal Name": c.animalName || "",
        "Age": c.age || "",
        "Sex": c.sex || "",
        "Sample Type": c.sampleType || "",
        "Sample Date (BS)": c.sampleDate || "",
        "Sample Date (AD)": c.sampleDateAd || "",
        "Culture/Organism": c.cultureResult || "",
        "Antibiotics Tested": antibiotics,
        "Zone Sizes (mm)": zoneSizes,
        "Sensitivity Results": sensitivities,
        "Remarks": c.remarks || "",
      };
    });

    if (format === "csv") {
      // Generate CSV
      if (rows.length === 0) {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=ast-cases.csv");
        return res.send("No data");
      }
      const headers = Object.keys(rows[0]);
      const csvLines = [
        headers.join(","),
        ...rows.map((row) =>
          headers.map((h) => {
            const val = String((row as any)[h]).replace(/"/g, '""');
            return `"${val}"`;
          }).join(",")
        ),
      ];
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=ast-cases.csv");
      return res.send(csvLines.join("\n"));
    }

    // Default: Excel
    try {
      const XLSX = require("xlsx");
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      // Set column widths
      ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 18 }));
      XLSX.utils.book_append_sheet(wb, ws, "AST Cases");
      const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=ast-cases.xlsx");
      return res.send(buffer);
    } catch (err) {
      return res.status(500).json({ message: "Failed to generate Excel file" });
    }
  });

  // ===================== BREAKPOINT ROUTES =====================

  app.get("/api/breakpoints", requireAuth, (_req, res) => {
    res.json(storage.getBreakpoints());
  });

  app.post("/api/breakpoints", requireAuth, requireRole("superadmin", "admin"), (req, res) => {
    const parsed = insertBreakpointSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
    }
    const bp = storage.createBreakpoint(parsed.data);
    res.status(201).json(bp);
  });

  app.patch("/api/breakpoints/:id", requireAuth, requireRole("superadmin", "admin"), (req, res) => {
    const updated = storage.updateBreakpoint(parseInt(req.params.id), req.body);
    if (!updated) return res.status(404).json({ message: "Breakpoint not found" });
    res.json(updated);
  });

  app.delete("/api/breakpoints/:id", requireAuth, requireRole("superadmin", "admin"), (req, res) => {
    const existing = storage.getBreakpoint(parseInt(req.params.id));
    if (!existing) return res.status(404).json({ message: "Breakpoint not found" });
    storage.deleteBreakpoint(parseInt(req.params.id));
    res.json({ message: "Breakpoint deleted" });
  });

  app.post("/api/breakpoints/reset", requireAuth, requireRole("superadmin", "admin"), (_req, res) => {
    const all = storage.getBreakpoints();
    for (const bp of all) {
      storage.deleteBreakpoint(bp.id);
    }
    for (const bp of SEED_BREAKPOINTS) {
      storage.createBreakpoint(bp);
    }
    res.json({ message: "Breakpoints reset to defaults", breakpoints: storage.getBreakpoints() });
  });
}
