import type { Express, Request, Response } from "express";
import { insertCaseSchema, patchCaseSchema } from "@shared/schema";
import { sql } from "drizzle-orm";
import { dbAll, dbGet, dbRun } from "../db-query";
import { allocateCaseIdentifiers, peekCaseIdentifiers } from "../case-counters";
import { caseRepo, type CaseListFilters, type CaseViewerAccess } from "../case-repo";
import { consumeApprovedDownloadRequest } from "../download-request-auth";
import { adYmdToBsYmd, isLikelyBsYmd } from "../nepali-date-utils";
import { authSessionRepo } from "../auth-session-repo";
import fs from "fs";
import path from "path";
import multer from "multer";
import { buildCasePdfBuffer } from "../case-pdf";
import {
  signAttachmentDownloadUrl,
  verifyAttachmentSignature,
} from "../services/attachment-signing";
import {
  canDownload,
  canDownloadHospital,
  canRegister,
  canRegisterHospital,
  getIdParam,
  getPaginationParams,
  getTodayBs,
  hasCapability,
  isDashboardVisibleForRole,
  isVthDashboardVisibleForRole,
  requireAnyCapability,
  requireAuth,
  requireRole,
} from "./context";
import type { AuthenticatedRequest } from "./types";
import { MESSAGES } from "./messages";
import { veterinarianRepo } from "../repos";
import { ensureMedicationsFromTreatmentDetails } from "../ensure-treatment-catalog-medications";
import {
  ensureHospitalChiefComplaintDefinition,
  ensureHospitalVaccinationDefinition,
  ensureHospitalTreatmentDefinition,
  ensureHospitalVeterinarianDefinition,
  ensureHospitalVitalsDefinition,
  mergeOrphanFormSections,
} from "../hospital-form-definition";
import {
  isTestsSuggestedSectionKey,
  shouldIncludeTestsSuggestedFormQuestion,
} from "@shared/hospital-tests-suggested";
import {
  astLongExportColumnOrder,
  astWideExportColumnOrder,
  buildExportCsvFilename,
  hospitalExportColumnOrder,
  parseExportQueryFilters,
  rowsToCsv,
  toAstLongExportRows,
  toAstWideExportRows,
  toHospitalExportRows,
} from "./cases-export";
import {
  computeHospitalDashboard,
  resolvePeriodWindow,
  type GroupBy,
  type HospitalDashboardPayload,
} from "../hospital-dashboard-analytics";

function resolveFormScope(raw: unknown): "ast" | "hospital" {
  return String(raw ?? "ast").toLowerCase() === "hospital" ? "hospital" : "ast";
}

/**
 * Per-user row filter for case reads.
 *
 * Historically this was used to restrict students to cases they registered
 * (`registered_by = user.id`). That policy was lifted so every authenticated
 * role with the relevant `*.case.view` capability can see ALL cases in the
 * module — this is intentional: students need to learn from cases handled by
 * other clinicians (diagnosis, treatment approach, etc.).
 *
 * The function is kept (rather than inlined as `undefined`) so a future
 * per-role data-scope policy (e.g. batch-scoped students) can be added in
 * one place without touching every read call site.
 */
function caseViewerAccess(_user: { id: number; role: string }): CaseViewerAccess | undefined {
  return undefined;
}

function parseExportOutput(raw: unknown): "csv" | "xlsx" | null {
  const s = String(raw ?? "csv").toLowerCase().trim();
  if (s === "csv" || s === "") return "csv";
  if (s === "xlsx") return "xlsx";
  return null;
}

const CASE_ATTACHMENT_UPLOAD_DIR = (() => {
  const raw = process.env.CASE_ATTACHMENTS_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), "uploads", "case-attachments");
})();
const MAX_ATTACHMENT_FILE_COUNT = 10;
const MAX_ATTACHMENT_FILE_SIZE = 1 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/pjpeg", // common on Windows for .jpg
  "image/x-png",
]);

function isAllowedCaseAttachmentFile(file: Express.Multer.File): boolean {
  const mime = (file.mimetype || "").toLowerCase();
  if (ALLOWED_ATTACHMENT_MIME_TYPES.has(mime)) return true;
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (![".jpg", ".jpeg", ".png"].includes(ext)) return false;
  // Browsers/OS often omit type or send octet-stream despite a real image file
  return mime === "" || mime === "application/octet-stream";
}

type CaseAttachmentRow = {
  id: number;
  case_id: number | null;
  section_key: string;
  category: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  created_at: string;
};

/**
 * Issue a short-lived signed URL for a case attachment.
 *
 * The previous implementation returned `/uploads/case-attachments/<file>`,
 * which was served by `express.static` with NO authentication — anyone with
 * the URL (and the URL was guessable / shareable / cached by reverse
 * proxies) could read patient images. We now return a `/api/case-attachments/:id`
 * URL signed with an HMAC; only the server can mint these, and they expire.
 *
 * Callers (the case-attachment list endpoints) must already have done the
 * scope/permission check for the parent case before calling this.
 */
function toAttachmentPublicUrl(attachmentId: number, userId: number): string {
  return signAttachmentDownloadUrl(attachmentId, userId);
}

type DownloadRequestRow = {
  id: number;
  user_id: number;
  request_source: string;
  date_from: string | null;
  date_to: string | null;
  reason: string | null;
  status: string;
  admin_note: string | null;
  resolved_by: number | null;
  created_at: string;
  resolved_at: string | null;
};

type CaseChangeLogRow = {
  id: number;
  case_id: number | null;
  case_number: string;
  case_scope: string;
  action: string;
  actor_user_id: number;
  actor_role: string;
  actor_name: string;
  actor_username: string;
  created_at: string;
};

function toDownloadRequest(row: DownloadRequestRow) {
  return {
    id: row.id,
    userId: row.user_id,
    requestSource: row.request_source,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    reason: row.reason,
    status: row.status,
    adminNote: row.admin_note,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function resolveCaseScopeFromCaseNumber(caseNumber: string): "ast" | "hospital" {
  return String(caseNumber || "")
    .toUpperCase()
    .startsWith("CASE-")
    ? "hospital"
    : "ast";
}

function resolveCaseScopeQuery(raw: unknown): "ast" | "hospital" | undefined {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "ast" || value === "hospital") return value;
  return undefined;
}

function userCanViewScope(role: string, scope: "ast" | "hospital"): boolean {
  return scope === "hospital"
    ? hasCapability(role, "hospital.case.view")
    : hasCapability(role, "ast.case.view");
}

function userCanEditScope(role: string, scope: "ast" | "hospital"): boolean {
  return scope === "hospital"
    ? hasCapability(role, "hospital.case.create")
    : hasCapability(role, "ast.case.create");
}

/**
 * Compares the user-meaningful fields of two case rows and returns the keys
 * that actually changed. Used to log a compact summary in case_change_logs
 * when a case is patched (so we can render a "who changed what" timeline).
 *
 * Server-controlled audit/counter fields are intentionally excluded so they
 * never appear as "changed" in the log.
 */
const CASE_PATCH_LOG_FIELD_KEYS = [
  "billNumber",
  "date",
  "dateAd",
  "ownerName",
  "ownerAddress",
  "ownerPhone",
  "species",
  "breed",
  "animalName",
  "age",
  "sex",
  "sampleType",
  "sampleDate",
  "sampleDateAd",
  "cultureResult",
  "astResults",
  "remarks",
  "customFields",
  "treatmentDetails",
  "veterinarianId",
  "veterinarianName",
  "veterinarianNvc",
  "veterinarianDepartment",
] as const;

function computeChangedCaseFieldKeys(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const changed: string[] = [];
  for (const key of CASE_PATCH_LOG_FIELD_KEYS) {
    const a = before[key];
    const b = after[key];
    if (a === b) continue;
    if (a == null && b == null) continue;
    if (typeof a === "string" && typeof b === "string" && a === b) continue;
    changed.push(key);
  }
  return changed;
}

export function registerCaseAndDownloadRoutes(app: Express) {
  if (!fs.existsSync(CASE_ATTACHMENT_UPLOAD_DIR)) {
    fs.mkdirSync(CASE_ATTACHMENT_UPLOAD_DIR, { recursive: true });
  }
  // The previous `app.use("/uploads/case-attachments", express.static(...))`
  // is gone on purpose. Case attachments now require a signed URL — see the
  // `GET /api/case-attachments/:id` handler below and `signAttachmentDownloadUrl`.

  app.get("/api/case-attachments/:id", async (req, res) => {
    const raw = req.params.id;
    const id = Number.parseInt(Array.isArray(raw) ? String(raw[0]) : String(raw), 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid attachment id" });
    }
    const tParam = String(req.query.t ?? "");
    const sigParam = String(req.query.sig ?? "");
    const uid = Number.parseInt(String(req.query.uid ?? ""), 10);
    if (!verifyAttachmentSignature(id, uid, tParam, sigParam)) {
      return res
        .status(403)
        .json({ message: "Attachment link is invalid or expired" });
    }
    const row = await dbGet<{
      id: number;
      mime_type: string;
      file_name: string;
      storage_path: string;
    }>(
      sql`SELECT id, mime_type, file_name, storage_path
          FROM case_attachments
          WHERE id = ${id}`,
    );
    if (!row) {
      return res.status(404).json({ message: "Attachment not found" });
    }
    const resolved = path.resolve(row.storage_path);
    if (!resolved.startsWith(CASE_ATTACHMENT_UPLOAD_DIR)) {
      // Defence in depth: refuse to serve files outside the configured upload dir.
      return res.status(403).json({ message: "Forbidden" });
    }
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ message: "Attachment file missing on disk" });
    }
    res.setHeader("Content-Type", row.mime_type || "application/octet-stream");
    // Signed URLs are time-bounded; allow short browser cache so re-renders
    // don't refetch the same image dozens of times within one page session.
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.sendFile(resolved);
  });

  const attachmentUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, CASE_ATTACHMENT_UPLOAD_DIR),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
        const random = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        cb(null, `${random}${ext}`);
      },
    }),
    limits: {
      fileSize: MAX_ATTACHMENT_FILE_SIZE,
      files: MAX_ATTACHMENT_FILE_COUNT,
    },
    fileFilter: (_req, file, cb) => {
      if (!isAllowedCaseAttachmentFile(file)) {
        cb(new Error("Only JPG, JPEG, and PNG files are allowed"));
        return;
      }
      cb(null, true);
    },
  });

  app.get("/api/dashboard/summary", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    const dashboardScope = resolveCaseScopeQuery(req.query.scope) ?? "ast";
    if (!userCanViewScope(currentUser.role, dashboardScope)) {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }
    const hasDashboardAccess =
      dashboardScope === "hospital"
        ? await isVthDashboardVisibleForRole(currentUser.role)
        : await isDashboardVisibleForRole(currentUser.role);
    if (!hasDashboardAccess) {
      return res.status(403).json({ message: "Dashboard is disabled for your role" });
    }
    const preset = String(req.query.preset ?? "all");
    const groupBy = String(req.query.groupBy ?? "month");
    const dateFromRaw = String(req.query.dateFrom ?? "").trim();
    const dateToRaw = String(req.query.dateTo ?? "").trim();
    const speciesFilter = String(req.query.species ?? "all").trim();
    const breedFilter = String(req.query.breed ?? "all").trim();
    const sexFilter = String(req.query.sex ?? "all").trim();
    const sampleTypeFilter = String(req.query.sampleType ?? "all").trim();
    const organismFilter = String(req.query.organism ?? "all").trim();
    const antibioticFilter = String(req.query.antibiotic ?? "all").trim();
    const resultFilter = String(req.query.result ?? "all").trim().toUpperCase();
    const minTested = Math.max(
      1,
      Number.parseInt(String(req.query.minTested ?? "5"), 10) || 5,
    );
    const now = new Date();

    const normalizeResult = (v: unknown): "S" | "I" | "R" | null => {
      const s = String(v ?? "").trim().toUpperCase();
      if (s === "S" || s === "SUSCEPTIBLE") return "S";
      if (s === "I" || s === "INTERMEDIATE") return "I";
      if (s === "R" || s === "RESISTANT") return "R";
      return null;
    };
    const toCountRows = (map: Map<string, number>) =>
      Array.from(map.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    const topName = (rows: Array<{ name: string; value: number }>) =>
      rows[0]?.name ?? "N/A";
    const parseAgeYears = (ageRaw: string | null | undefined): number | null => {
      const s = String(ageRaw ?? "").trim();
      if (!s) return null;
      const num = Number.parseFloat(s.replace(",", "."));
      if (!Number.isFinite(num)) return null;
      if (s.toLowerCase().includes("month")) return num / 12;
      return num;
    };
    const ageBand = (ageRaw: string | null | undefined) => {
      const years = parseAgeYears(ageRaw);
      if (years == null) return "Unknown";
      if (years < 1) return "<1 year";
      if (years <= 3) return "1-3 years";
      if (years <= 7) return "4-7 years";
      return ">7 years";
    };
    const startByPreset = (p: string) => {
      const d = new Date(now);
      switch (p) {
        case "today":
          d.setHours(0, 0, 0, 0);
          return d;
        case "7d":
          d.setDate(d.getDate() - 7);
          return d;
        case "30d":
          d.setDate(d.getDate() - 30);
          return d;
        case "3m":
          d.setMonth(d.getMonth() - 3);
          return d;
        case "6m":
          d.setMonth(d.getMonth() - 6);
          return d;
        case "12m":
          d.setFullYear(d.getFullYear() - 1);
          return d;
        default:
          return null;
      }
    };
    const dateToTs = (s: string): number | null => {
      if (!s) return null;
      const ts = new Date(s).getTime();
      return Number.isFinite(ts) ? ts : null;
    };
    const startPresetTs = startByPreset(preset)?.getTime() ?? null;
    const dateFromTs = dateToTs(dateFromRaw);
    const dateToTsValue = dateToTs(dateToRaw);
    const effectiveStartTs = dateFromTs ?? startPresetTs;
    const effectiveEndTs = dateToTsValue;

    const getTimeKey = (sampleDate: string) => {
      const match = sampleDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return sampleDate;
      const y = match[1];
      const m = match[2];
      const d = Number.parseInt(match[3], 10);
      if (groupBy === "day") return `${y}-${m}-${String(d).padStart(2, "0")}`;
      if (groupBy === "week") return `${y}-${m}-W${Math.max(1, Math.ceil(d / 7))}`;
      if (groupBy === "month") return `${y}-${m}`;
      return y;
    };

    const toAdDate = (ts: number | null) =>
      ts != null ? new Date(ts).toISOString().slice(0, 10) : undefined;
    let dateFromBs = isLikelyBsYmd(dateFromRaw) ? dateFromRaw : undefined;
    let dateToBs = isLikelyBsYmd(dateToRaw) ? dateToRaw : undefined;
    const dateFromAd = dateFromBs ? undefined : dateFromRaw || toAdDate(effectiveStartTs);
    const dateToAd = dateToBs ? undefined : dateToRaw || toAdDate(effectiveEndTs);
    if (!dateFromBs && dateFromAd) dateFromBs = adYmdToBsYmd(dateFromAd);
    if (!dateToBs && dateToAd) dateToBs = adYmdToBsYmd(dateToAd);

    const filterOptions = await caseRepo.getDashboardFilterOptions(
      dashboardScope,
      caseViewerAccess(currentUser),
    );
    const speciesSet = new Set(filterOptions.species);
    const breedSet = new Set(filterOptions.breeds);
    const sexSet = new Set(filterOptions.sexes);
    const sampleTypeSet = new Set(filterOptions.sampleTypes);
    const organismSet = new Set(filterOptions.organisms);
    const antibioticSet = new Set<string>();

    const caseBase = await caseRepo.getCasesForDashboard(dashboardScope, {
      viewer: caseViewerAccess(currentUser),
      dateFromAd,
      dateToAd,
      dateFromBs,
      dateToBs,
      species: speciesFilter,
      breed: breedFilter,
      sex: sexFilter,
      sampleType: sampleTypeFilter,
      organism: organismFilter,
    });

    const astRows = caseBase.flatMap((c) => {
      const species = String(c.species || "Unknown").trim() || "Unknown";
      const breed = String(c.breed || "Unknown").trim() || "Unknown";
      const sex = String(c.sex || "Unknown").trim() || "Unknown";
      const sampleType = String(c.sampleType || "Unknown").trim() || "Unknown";
      const organism = String(c.cultureResult || "").trim() || "Not entered";
      const sampleDate = String(c.sampleDate || "").trim();
      const sampleDateAd = String(c.sampleDateAd || "").trim();
      try {
        const parsed = JSON.parse(c.astResults || "[]") as Array<{
          antibiotic?: string;
          sensitivity?: string;
        }>;
        return parsed
          .map((r) => {
            const antibiotic = String(r.antibiotic || "").trim();
            const result = normalizeResult(r.sensitivity);
            if (!antibiotic || !result) return null;
            antibioticSet.add(antibiotic);
            return {
              caseId: c.id,
              caseNumber: c.caseNumber,
              ownerName: c.ownerName,
              phoneNumber: c.ownerPhone || "",
              address: c.ownerAddress || "",
              animalName: c.animalName || "",
              species,
              breed,
              age: c.age || "",
              sex,
              sampleType,
              sampleCollectionDate: sampleDate || c.date || "",
              sampleCollectionDateAd: sampleDateAd,
              organismIsolated: organism,
              antibiotic,
              resultCategory: result,
            };
          })
          .filter(Boolean) as Array<{
          caseId: number;
          caseNumber: string;
          ownerName: string;
          phoneNumber: string;
          address: string;
          animalName: string;
          species: string;
          breed: string;
          age: string;
          sex: string;
          sampleType: string;
          sampleCollectionDate: string;
          sampleCollectionDateAd: string;
          organismIsolated: string;
          antibiotic: string;
          resultCategory: "S" | "I" | "R";
        }>;
      } catch {
        return [];
      }
    });

    const astFiltered = astRows.filter((r) => {
      if (
        antibioticFilter !== "all" &&
        r.antibiotic.trim().toLowerCase() !== antibioticFilter.trim().toLowerCase()
      ) {
        return false;
      }
      if (resultFilter !== "ALL" && resultFilter !== "all" && r.resultCategory !== resultFilter)
        return false;
      return true;
    });

    const caseIdsWithAst = new Set(astFiltered.map((r) => r.caseId));
    const casesScoped =
      antibioticFilter === "all" && (resultFilter === "ALL" || resultFilter === "all")
        ? caseBase
        : caseBase.filter((c) => caseIdsWithAst.has(c.id));

    const totalsByResult = { S: 0, I: 0, R: 0 };
    for (const r of astFiltered) totalsByResult[r.resultCategory] += 1;
    const testedTotal = astFiltered.length;
    const pct = (n: number) =>
      testedTotal > 0 ? Number(((n / testedTotal) * 100).toFixed(1)) : 0;

    const speciesCounts = new Map<string, number>();
    const breedCounts = new Map<string, number>();
    const sexCounts = new Map<string, number>();
    const ageBandCounts = new Map<string, number>();
    const sampleTypeCounts = new Map<string, number>();
    const organismCounts = new Map<string, number>();
    const caseTrend = new Map<string, number>();
    const sampleTypeTrend = new Map<string, Map<string, number>>();
    const sampleTypeBySpecies = new Map<string, Map<string, number>>();
    const organismBySpecies = new Map<string, Map<string, number>>();
    const organismBySampleType = new Map<string, Map<string, number>>();
    const organismTrend = new Map<string, Map<string, number>>();
    let organismEnteredCases = 0;
    let culturePositiveCases = 0;

    for (const c of casesScoped) {
      const species = String(c.species || "Unknown").trim() || "Unknown";
      const breed = String(c.breed || "Unknown").trim() || "Unknown";
      const sex = String(c.sex || "Unknown").trim() || "Unknown";
      const sampleType = String(c.sampleType || "Unknown").trim() || "Unknown";
      const ageB = ageBand(c.age);
      const organism = String(c.cultureResult || "").trim();
      const sampleDate = String(c.sampleDate || c.date || "").trim();
      const tKey = getTimeKey(sampleDate);

      speciesCounts.set(species, (speciesCounts.get(species) ?? 0) + 1);
      breedCounts.set(breed, (breedCounts.get(breed) ?? 0) + 1);
      sexCounts.set(sex, (sexCounts.get(sex) ?? 0) + 1);
      ageBandCounts.set(ageB, (ageBandCounts.get(ageB) ?? 0) + 1);
      sampleTypeCounts.set(sampleType, (sampleTypeCounts.get(sampleType) ?? 0) + 1);
      caseTrend.set(tKey, (caseTrend.get(tKey) ?? 0) + 1);

      const stMap = sampleTypeTrend.get(tKey) ?? new Map<string, number>();
      stMap.set(sampleType, (stMap.get(sampleType) ?? 0) + 1);
      sampleTypeTrend.set(tKey, stMap);

      const stSpecies = sampleTypeBySpecies.get(species) ?? new Map<string, number>();
      stSpecies.set(sampleType, (stSpecies.get(sampleType) ?? 0) + 1);
      sampleTypeBySpecies.set(species, stSpecies);

      if (organism) {
        organismEnteredCases += 1;
        organismCounts.set(organism, (organismCounts.get(organism) ?? 0) + 1);
        if (!/no growth|negative/i.test(organism)) culturePositiveCases += 1;

        const obSpecies = organismBySpecies.get(species) ?? new Map<string, number>();
        obSpecies.set(organism, (obSpecies.get(organism) ?? 0) + 1);
        organismBySpecies.set(species, obSpecies);

        const obSample = organismBySampleType.get(sampleType) ?? new Map<string, number>();
        obSample.set(organism, (obSample.get(organism) ?? 0) + 1);
        organismBySampleType.set(sampleType, obSample);

        const obTrend = organismTrend.get(tKey) ?? new Map<string, number>();
        obTrend.set(organism, (obTrend.get(organism) ?? 0) + 1);
        organismTrend.set(tKey, obTrend);
      }
    }

    const aggregateSirBy = (rows: typeof astFiltered, keyFn: (r: (typeof astFiltered)[number]) => string) => {
      const map = new Map<
        string,
        { tested: number; S: number; I: number; R: number }
      >();
      for (const r of rows) {
        const key = keyFn(r);
        const curr = map.get(key) ?? { tested: 0, S: 0, I: 0, R: 0 };
        curr.tested += 1;
        curr[r.resultCategory] += 1;
        map.set(key, curr);
      }
      return Array.from(map.entries())
        .map(([name, v]) => ({
          name,
          tested: v.tested,
          susceptible: v.S,
          intermediate: v.I,
          resistant: v.R,
          susceptiblePct: v.tested ? Number(((v.S / v.tested) * 100).toFixed(1)) : 0,
          intermediatePct: v.tested ? Number(((v.I / v.tested) * 100).toFixed(1)) : 0,
          resistantPct: v.tested ? Number(((v.R / v.tested) * 100).toFixed(1)) : 0,
          lowData: v.tested < minTested,
        }))
        .sort((a, b) => b.tested - a.tested);
    };

    const sirByAntibiotic = aggregateSirBy(astFiltered, (r) => r.antibiotic);
    const sirBySpecies = aggregateSirBy(astFiltered, (r) => r.species);
    const sirBySampleType = aggregateSirBy(astFiltered, (r) => r.sampleType);
    const sirByOrganism = aggregateSirBy(
      astFiltered.filter((r) => r.organismIsolated !== "Not entered"),
      (r) => r.organismIsolated,
    );

    const topOrganisms = toCountRows(organismCounts).slice(0, 10).map((r) => r.name);
    const topAntibiotics = sirByAntibiotic.slice(0, 10).map((r) => r.name);

    const toStackRows = (
      source: Map<string, Map<string, number>>,
      topKeys: string[],
      keyName: string,
    ) =>
      Array.from(source.entries())
        .map(([bucket, subMap]) => {
          const row: Record<string, string | number> = { [keyName]: bucket };
          for (const k of topKeys) row[k] = subMap.get(k) ?? 0;
          return row;
        })
        .sort((a, b) =>
          String(a[keyName]).localeCompare(String(b[keyName]), undefined, { numeric: true }),
        );

    const organismAntibiogramRows = Array.from(
      new Set(astFiltered.filter((r) => r.organismIsolated !== "Not entered").map((r) => r.organismIsolated)),
    ).sort((a, b) => a.localeCompare(b));
    const organismAntibiogramCols = Array.from(
      new Set(astFiltered.map((r) => r.antibiotic)),
    ).sort((a, b) => a.localeCompare(b));
    const antibiogramMatrix = organismAntibiogramRows.map((org) => {
      const cells = organismAntibiogramCols.map((ab) => {
        const rows = astFiltered.filter(
          (r) => r.organismIsolated === org && r.antibiotic === ab,
        );
        const tested = rows.length;
        const s = rows.filter((r) => r.resultCategory === "S").length;
        const i = rows.filter((r) => r.resultCategory === "I").length;
        const r = rows.filter((r) => r.resultCategory === "R").length;
        return {
          antibiotic: ab,
          tested,
          susceptible: s,
          intermediate: i,
          resistant: r,
          susceptiblePct: tested ? Number(((s / tested) * 100).toFixed(1)) : 0,
          resistantPct: tested ? Number(((r / tested) * 100).toFixed(1)) : 0,
          lowData: tested < minTested,
        };
      });
      return { organism: org, cells };
    });

    const trendFromRows = (
      rows: typeof astFiltered,
      keyFn: (r: (typeof astFiltered)[number]) => string,
      label: string,
    ) => {
      const map = new Map<string, number>();
      for (const r of rows) {
        const k = getTimeKey(r.sampleCollectionDate || "");
        map.set(k, (map.get(k) ?? 0) + 1);
      }
      return Array.from(map.entries())
        .map(([period, value]) => ({ period, value, label }))
        .sort((a, b) => a.period.localeCompare(b.period, undefined, { numeric: true }));
    };

    const selectedAntibioticRows =
      antibioticFilter === "all"
        ? astFiltered
        : astFiltered.filter((r) => r.antibiotic === antibioticFilter);
    const selectedOrganismRows =
      organismFilter === "all"
        ? astFiltered.filter((r) => r.organismIsolated !== "Not entered")
        : astFiltered.filter((r) => r.organismIsolated === organismFilter);
    const pairRows =
      antibioticFilter !== "all" && organismFilter !== "all"
        ? astFiltered.filter(
            (r) =>
              r.antibiotic === antibioticFilter && r.organismIsolated === organismFilter,
          )
        : [];

    const sirTrend = (() => {
      const map = new Map<string, { S: number; I: number; R: number }>();
      for (const r of astFiltered) {
        const k = getTimeKey(r.sampleCollectionDate || "");
        const curr = map.get(k) ?? { S: 0, I: 0, R: 0 };
        curr[r.resultCategory] += 1;
        map.set(k, curr);
      }
      return Array.from(map.entries())
        .map(([period, v]) => ({ period, susceptible: v.S, intermediate: v.I, resistant: v.R }))
        .sort((a, b) => a.period.localeCompare(b.period, undefined, { numeric: true }));
    })();

    const drilldownRows = astFiltered.slice(0, 500);

    return res.json({
      filters: {
        preset,
        groupBy,
        species: speciesFilter,
        breed: breedFilter,
        sex: sexFilter,
        sampleType: sampleTypeFilter,
        organism: organismFilter,
        antibiotic: antibioticFilter,
        result: resultFilter,
      },
      options: {
        species: Array.from(speciesSet).sort((a, b) => a.localeCompare(b)),
        breeds: Array.from(breedSet).sort((a, b) => a.localeCompare(b)),
        sex: Array.from(sexSet).sort((a, b) => a.localeCompare(b)),
        sampleTypes: Array.from(sampleTypeSet).sort((a, b) => a.localeCompare(b)),
        organisms: Array.from(organismSet).sort((a, b) => a.localeCompare(b)),
        antibiotics: Array.from(antibioticSet).sort((a, b) => a.localeCompare(b)),
      },
      metadata: {
        minTested,
      },
      overview: {
        totalRegisteredCases: casesScoped.length,
        totalSamples: casesScoped.length,
        totalCasesWithOrganismEntered: organismEnteredCases,
        totalAntibioticTestRecords: astFiltered.length,
        totalDistinctOrganisms: new Set(
          casesScoped.map((c) => String(c.cultureResult || "").trim()).filter(Boolean),
        ).size,
        totalDistinctAntibiotics: new Set(astFiltered.map((r) => r.antibiotic)).size,
        overallSusceptiblePct: pct(totalsByResult.S),
        overallIntermediatePct: pct(totalsByResult.I),
        overallResistantPct: pct(totalsByResult.R),
        mostCommonSpecies: topName(toCountRows(speciesCounts)),
        mostCommonSampleType: topName(toCountRows(sampleTypeCounts)),
        mostCommonOrganism: topName(toCountRows(organismCounts)),
        mostFrequentlyUsedAntibiotic: topName(
          sirByAntibiotic.map((r) => ({ name: r.name, value: r.tested })),
        ),
      },
      animalProfile: {
        casesBySpecies: toCountRows(speciesCounts),
        casesByBreed: toCountRows(breedCounts).slice(0, 20),
        casesBySex: toCountRows(sexCounts),
        casesByAgeGroup: toCountRows(ageBandCounts),
      },
      sampleProfile: {
        samplesBySampleType: toCountRows(sampleTypeCounts),
        samplesOverTime: Array.from(caseTrend.entries())
          .map(([period, value]) => ({ period, value }))
          .sort((a, b) => a.period.localeCompare(b.period, undefined, { numeric: true })),
        sampleTypeBySpecies: toStackRows(sampleTypeBySpecies, Array.from(sampleTypeSet), "species"),
        sampleTypeTrend: toStackRows(sampleTypeTrend, Array.from(sampleTypeSet), "period"),
      },
      organismProfile: {
        casesWithOrganism: organismEnteredCases,
        casesWithoutOrganism: Math.max(0, casesScoped.length - organismEnteredCases),
        topOrganismsIsolated: toCountRows(organismCounts).slice(0, 12),
        organismsBySpecies: toStackRows(organismBySpecies, topOrganisms, "species"),
        organismsBySampleType: toStackRows(organismBySampleType, topOrganisms, "sampleType"),
        organismsOverTime: toStackRows(organismTrend, topOrganisms, "period"),
        culturePositiveCases,
      },
      antibioticProfile: {
        overallSirDistribution: [
          { name: "Susceptible", value: totalsByResult.S },
          { name: "Intermediate", value: totalsByResult.I },
          { name: "Resistant", value: totalsByResult.R },
        ],
        antibioticTestingFrequency: sirByAntibiotic.map((r) => ({
          name: r.name,
          tested: r.tested,
        })),
        susceptiblePctByAntibiotic: sirByAntibiotic.map((r) => ({
          name: r.name,
          value: r.susceptiblePct,
          tested: r.tested,
          lowData: r.lowData,
        })),
        resistantPctByAntibiotic: sirByAntibiotic.map((r) => ({
          name: r.name,
          value: r.resistantPct,
          tested: r.tested,
          lowData: r.lowData,
        })),
        sirByAntibiotic,
        sirBySpecies,
        sirBySampleType,
        sirByOrganism,
      },
      antibiogram: {
        modeDefault: "resistantPct",
        organisms: organismAntibiogramRows,
        antibiotics: organismAntibiogramCols,
        matrix: antibiogramMatrix,
      },
      trends: {
        totalCasesOverTime: Array.from(caseTrend.entries())
          .map(([period, value]) => ({ period, value }))
          .sort((a, b) => a.period.localeCompare(b.period, undefined, { numeric: true })),
        speciesCasesOverTime: trendFromRows(astFiltered, (r) => r.species, "species"),
        organismFrequencyOverTime: trendFromRows(
          astFiltered.filter((r) => r.organismIsolated !== "Not entered"),
          (r) => r.organismIsolated,
          "organism",
        ),
        antibioticTestingFrequencyOverTime: trendFromRows(astFiltered, (r) => r.antibiotic, "antibiotic"),
        resistanceTrendForSelectedAntibiotic: trendFromRows(
          selectedAntibioticRows.filter((r) => r.resultCategory === "R"),
          (r) => r.antibiotic,
          "resistant",
        ),
        susceptibilityTrendForSelectedOrganism: trendFromRows(
          selectedOrganismRows.filter((r) => r.resultCategory === "S"),
          (r) => r.organismIsolated,
          "susceptible",
        ),
        resistanceTrendForSelectedPair: trendFromRows(
          pairRows.filter((r) => r.resultCategory === "R"),
          () => "pair",
          "resistant",
        ),
        sirTrend,
      },
      drilldownRows,
    });
  });

  // -------------------------------------------------------------------------
  // Hospital-native dashboard summary.
  //
  // Returns a different payload shape than `/api/dashboard/summary` because the
  // hospital module's analytics are based on prescriptions, vets/departments,
  // vitals, tests-ordered and avian flock data — *not* AST samples/organisms/
  // antibiograms. Kept as a separate endpoint so the AST handler above stays
  // untouched and so the wire shape can evolve independently.
  // -------------------------------------------------------------------------
  app.get("/api/dashboard/hospital-summary", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    if (!userCanViewScope(currentUser.role, "hospital")) {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }
    if (!(await isVthDashboardVisibleForRole(currentUser.role))) {
      return res.status(403).json({ message: "Dashboard is disabled for your role" });
    }

    const preset = String(req.query.preset ?? "30d");
    const groupByRaw = String(req.query.groupBy ?? "month").toLowerCase();
    const groupBy: GroupBy =
      groupByRaw === "day" || groupByRaw === "week" || groupByRaw === "year"
        ? (groupByRaw as GroupBy)
        : "month";
    const dateFromRaw = String(req.query.dateFrom ?? "").trim();
    const dateToRaw = String(req.query.dateTo ?? "").trim();
    const speciesFilter = String(req.query.species ?? "all").trim();
    const breedFilter = String(req.query.breed ?? "all").trim();
    const sexFilter = String(req.query.sex ?? "all").trim();
    const departmentFilter = String(req.query.department ?? "all").trim();
    const vetFilter = String(req.query.vet ?? "all").trim();
    const medicationClassFilter = String(req.query.medicationClass ?? "all").trim();
    const avianOnly = String(req.query.avianOnly ?? "").toLowerCase() === "true";
    const comparePrior = String(req.query.comparePrior ?? "true").toLowerCase() !== "false";

    const now = new Date();
    // Custom date range support: only treat as custom if both ends look like
    // AD ISO dates (the only format the period resolver understands here).
    const isAdYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    const customAdFrom = isAdYmd(dateFromRaw) ? dateFromRaw : undefined;
    const customAdTo = isAdYmd(dateToRaw) ? dateToRaw : undefined;
    const periodWindow = resolvePeriodWindow({
      preset,
      now,
      dateFromAd: customAdFrom,
      dateToAd: customAdTo,
    });

    // To compute deltas + the caseload-trend overlay, fetch cases that span
    // BOTH the current and the prior window. The analytics module splits them
    // internally based on each case's AD date.
    const sqlFromAd = periodWindow.prior.start;
    const sqlToAd = periodWindow.current.end;
    let dateFromBs = isLikelyBsYmd(dateFromRaw) ? dateFromRaw : undefined;
    let dateToBs = isLikelyBsYmd(dateToRaw) ? dateToRaw : undefined;
    const dateFromAd = dateFromBs ? undefined : sqlFromAd;
    const dateToAd = dateToBs ? undefined : sqlToAd;
    if (!dateFromBs && dateFromAd) dateFromBs = adYmdToBsYmd(dateFromAd);
    if (!dateToBs && dateToAd) dateToBs = adYmdToBsYmd(dateToAd);

    const viewer = caseViewerAccess(currentUser);
    const filterOptions = await caseRepo.getDashboardFilterOptions("hospital", viewer);
    const caseRows = await caseRepo.getCasesForDashboard("hospital", {
      viewer,
      dateFromAd,
      dateToAd,
      dateFromBs,
      dateToBs,
      species: speciesFilter,
      breed: breedFilter,
      sex: sexFilter,
    });

    // Distinct department / vet values come from the case set itself (what the
    // viewer is actually allowed to see), not the veterinarians catalog — that
    // keeps role-scoped views honest.
    const departments = new Set<string>();
    const vets = new Set<string>();
    for (const c of caseRows) {
      const d = String(c.veterinarianDepartment ?? "").trim();
      const v = String(c.veterinarianName ?? "").trim();
      if (d) departments.add(d);
      if (v) vets.add(v);
    }

    // Medication catalog → class lookup (lower-cased name for case-insensitive matching).
    const medRows = await dbAll<{ name: string; medication_class: string | null }>(
      sql`SELECT name, medication_class FROM medications`,
    );
    const medicationClassByName = new Map<string, string>();
    const medicationClasses = new Set<string>();
    for (const row of medRows) {
      const name = String(row.name ?? "").trim().toLowerCase();
      const klass = String(row.medication_class ?? "").trim();
      if (name && klass) {
        medicationClassByName.set(name, klass);
        medicationClasses.add(klass);
      }
    }

    const analytics = computeHospitalDashboard({
      cases: caseRows,
      groupBy,
      medicationClassByName,
      filters: {
        department: departmentFilter,
        vet: vetFilter,
        medicationClass: medicationClassFilter,
        avianOnly,
      },
      now,
      period: periodWindow,
      casesIncludePrior: true,
      comparePrior,
    });

    const payload: HospitalDashboardPayload = {
      filters: {
        preset,
        groupBy,
        species: speciesFilter,
        breed: breedFilter,
        sex: sexFilter,
        department: departmentFilter,
        vet: vetFilter,
        medicationClass: medicationClassFilter,
        avianOnly,
        dateFrom: dateFromRaw || undefined,
        dateTo: dateToRaw || undefined,
        comparePrior,
      },
      options: {
        species: filterOptions.species,
        breeds: filterOptions.breeds,
        sex: filterOptions.sexes,
        departments: Array.from(departments).sort((a, b) => a.localeCompare(b)),
        vets: Array.from(vets).sort((a, b) => a.localeCompare(b)),
        medicationClasses: Array.from(medicationClasses).sort((a, b) => a.localeCompare(b)),
      },
      ...analytics,
    };

    return res.json(payload);
  });

  app.get(
    "/api/species-options",
    requireAuth,
    requireAnyCapability("ast.case.create", "hospital.case.create"),
    async (_req, res) => {
    const rows = await dbAll<{ name: string }>(
      sql`SELECT name FROM species_options ORDER BY name ASC`,
    );
    res.json(rows.map((r) => r.name));
  });

  app.get(
    "/api/breed-options",
    requireAuth,
    requireAnyCapability("ast.case.create", "hospital.case.create"),
    async (req, res) => {
    const species = String(req.query.species ?? "").trim();
    if (!species) return res.json([]);
    const rows = await dbAll<{ name: string }>(
      sql`SELECT name FROM breed_options WHERE species_name = ${species} ORDER BY name ASC`,
    );
    res.json(rows.map((r) => r.name));
  });

  app.get(
    "/api/medications",
    requireAuth,
    requireAnyCapability("ast.case.create", "hospital.case.create"),
    async (_req, res) => {
      const rows = await dbAll<{ name: string }>(
        sql`SELECT name FROM medications ORDER BY COALESCE(display_order, id) ASC, id ASC`,
      );
      return res.json(rows.map((r) => r.name));
    },
  );

  app.get(
    "/api/routes-of-administration",
    requireAuth,
    requireAnyCapability("ast.case.create", "hospital.case.create"),
    async (_req, res) => {
      const rows = await dbAll<{ abbreviation: string; name: string }>(
        sql`SELECT abbreviation, name
            FROM routes_of_administration
            ORDER BY COALESCE(display_order, id) ASC, id ASC`,
      );
      return res.json(
        rows.map((r) => ({
          abbreviation: (r.abbreviation || r.name || "").trim(),
          name: (r.name || "").trim(),
        })),
      );
    },
  );

  app.get(
    "/api/frequencies",
    requireAuth,
    requireAnyCapability("ast.case.create", "hospital.case.create"),
    async (_req, res) => {
      const rows = await dbAll<{ short_code: string | null; name: string }>(
        sql`SELECT short_code, name
            FROM frequencies
            ORDER BY COALESCE(display_order, id) ASC, id ASC`,
      );
      return res.json(
        rows.map((r) => ({
          abbreviation: (r.short_code || r.name || "").trim(),
          name: (r.name || "").trim(),
        })),
      );
    },
  );

  app.get(
    "/api/dose-units",
    requireAuth,
    requireAnyCapability("ast.case.create", "hospital.case.create"),
    async (_req, res) => {
      const rows = await dbAll<{ name: string }>(
        sql`SELECT name FROM dose_units ORDER BY COALESCE(display_order, id) ASC, id ASC`,
      );
      return res.json(rows.map((r) => r.name));
    },
  );

  app.get(
    "/api/veterinarians",
    requireAuth,
    requireAnyCapability("ast.case.create", "hospital.case.create"),
    async (_req, res) => {
      const rows = await veterinarianRepo.getVeterinarians();
      return res.json(rows);
    },
  );

  app.get(
    "/api/durations",
    requireAuth,
    requireAnyCapability("ast.case.create", "hospital.case.create"),
    async (_req, res) => {
      const rows = await dbAll<{ name: string }>(
        sql`SELECT name FROM durations ORDER BY COALESCE(display_order, id) ASC, id ASC`,
      );
      return res.json(rows.map((r) => r.name));
    },
  );

  app.get(
    "/api/form-config",
    requireAuth,
    requireAnyCapability("ast.case.create", "hospital.case.create"),
    async (_req, res) => {
    const rows = await dbAll<{
      key: string;
      section: string;
      label: string;
      enabled: number;
      required: number;
    }>(
      sql`SELECT key, section, label, enabled, required
          FROM form_field_configs
          ORDER BY section ASC, label ASC`,
    );
    res.json(
      rows.map((r) => ({
        ...r,
        enabled: Boolean(r.enabled),
        required: Boolean(r.required),
      })),
    );
  });

  app.get(
    "/api/form-definition",
    requireAuth,
    requireAnyCapability("ast.case.create", "hospital.case.create"),
    async (req, res) => {
    const scope = resolveFormScope(req.query.scope);
    if (scope === "hospital") {
      await ensureHospitalTreatmentDefinition();
      await ensureHospitalVeterinarianDefinition();
      await ensureHospitalVitalsDefinition();
      await ensureHospitalChiefComplaintDefinition();
      await ensureHospitalVaccinationDefinition();
    }
    let sections = await dbAll<{ key: string; title: string; display_order: number }>(
      sql`SELECT key, title, display_order FROM form_sections
          WHERE form_scope = 'shared' OR form_scope = ${scope}
          ORDER BY display_order ASC`,
    );
    const questions = await dbAll<{
      id: number;
      key: string;
      section_key: string;
      label: string;
      input_type: string;
      options_json: string | null;
      enabled: number;
      required: number;
      hide_label: number;
      display_order: number;
      is_builtin: number;
    }>(
      sql`SELECT id, key, section_key, label, input_type, options_json, enabled, required, hide_label, display_order, is_builtin
          FROM form_questions
          WHERE form_scope = 'shared' OR form_scope = ${scope}
          ORDER BY section_key ASC, display_order ASC`,
    );
    sections = mergeOrphanFormSections(sections, questions);
    const bySection = new Map<string, typeof questions>();
    for (const q of questions) {
      const list = bySection.get(q.section_key) ?? [];
      list.push(q);
      bySection.set(q.section_key, list);
    }
    res.json({
      sections: sections.map((s) => ({
        key: s.key,
        title: s.title,
        displayOrder: s.display_order,
        questions: (bySection.get(s.key) ?? [])
          .filter((q) => {
            if (!isTestsSuggestedSectionKey(s.key, s.title)) return true;
            return shouldIncludeTestsSuggestedFormQuestion({
              key: q.key,
              label: q.label,
              inputType: q.input_type,
            });
          })
          .map((q) => ({
            id: q.id,
            key: q.key,
            label: q.label,
            inputType: q.input_type,
            options: q.options_json ? JSON.parse(q.options_json) : [],
            enabled: Boolean(q.enabled),
            required: Boolean(q.required),
            hideLabel: Boolean(q.hide_label),
            displayOrder: q.display_order,
            isBuiltin: Boolean(q.is_builtin),
          })),
      })),
    });
  });

  app.post("/api/download-requests", requireAuth, async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).currentUser;
    const { dateFrom, dateTo, reason } = req.body;
    const requestSourceRaw = String(req.body?.requestSource ?? "ast_report").trim().toLowerCase();
    const requestSource = requestSourceRaw === "hospital_case" ? "hospital_case" : "ast_report";
    await dbRun(
      sql`INSERT INTO download_requests
          (user_id, request_source, date_from, date_to, reason, status, created_at)
          VALUES (
            ${user.id},
            ${requestSource},
            ${dateFrom || null},
            ${dateTo || null},
            ${reason || null},
            ${"pending"},
            ${new Date().toISOString()}
          )`,
    );
    const created = await dbGet<DownloadRequestRow>(
      sql`SELECT id, user_id, request_source, date_from, date_to, reason, status, admin_note, resolved_by, created_at, resolved_at
          FROM download_requests
          ORDER BY id DESC
          LIMIT 1`,
    );
    const request = created ? toDownloadRequest(created) : null;
    if (!request) {
      return res.status(500).json({ message: "Failed to create request" });
    }
    res.status(201).json(request);
  });

  app.get(
    "/api/download-requests/mine",
    requireAuth,
    async (req: Request, res: Response) => {
      const user = (req as AuthenticatedRequest).currentUser;
      const rows = await dbAll<DownloadRequestRow>(
        sql`SELECT id, user_id, request_source, date_from, date_to, reason, status, admin_note, resolved_by, created_at, resolved_at
            FROM download_requests
            WHERE user_id = ${user.id}
            ORDER BY created_at DESC`,
      );
      res.json(rows.map(toDownloadRequest));
    },
  );

  app.get(
    "/api/case-change-logs",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const scopeRaw = String(req.query.scope ?? "all")
        .trim()
        .toLowerCase();
      const scopeFilter = scopeRaw === "ast" || scopeRaw === "hospital" ? scopeRaw : "all";
      const rows = await dbAll<CaseChangeLogRow>(
        scopeFilter === "all"
          ? sql`SELECT id, case_id, case_number, case_scope, action, actor_user_id, actor_role, actor_name, actor_username, created_at
                FROM case_change_logs
                ORDER BY created_at DESC
                LIMIT 300`
          : sql`SELECT id, case_id, case_number, case_scope, action, actor_user_id, actor_role, actor_name, actor_username, created_at
                FROM case_change_logs
                WHERE (
                  ${scopeFilter} = 'hospital'
                  AND (
                    LOWER(TRIM(COALESCE(case_scope, ''))) IN ('hospital', 'hospital_case')
                    OR UPPER(TRIM(COALESCE(case_number, ''))) LIKE 'CASE-%'
                  )
                ) OR (
                  ${scopeFilter} = 'ast'
                  AND (
                    LOWER(TRIM(COALESCE(case_scope, ''))) = 'ast'
                    OR (
                      TRIM(COALESCE(case_scope, '')) = ''
                      AND UPPER(TRIM(COALESCE(case_number, ''))) NOT LIKE 'CASE-%'
                    )
                  )
                )
                ORDER BY created_at DESC
                LIMIT 300`,
      );
      return res.json(
        rows.map((row) => ({
          id: row.id,
          caseId: row.case_id,
          caseNumber: row.case_number,
          caseScope: row.case_scope,
          action: row.action,
          actorUserId: row.actor_user_id,
          actorRole: row.actor_role,
          actorName: row.actor_name,
          actorUsername: row.actor_username,
          createdAt: row.created_at,
        })),
      );
    },
  );

  app.post(
    "/api/case-attachments/temp",
    requireAuth,
    requireAnyCapability("ast.case.create", "hospital.case.create"),
    attachmentUpload.array("files", MAX_ATTACHMENT_FILE_COUNT),
    async (req, res, next) => {
      try {
        const currentUser = (req as AuthenticatedRequest).currentUser;
        const files = (req.files as Express.Multer.File[]) ?? [];
        if (files.length === 0) {
          return res.status(400).json({ message: "Please select at least one image" });
        }
        if (files.length > MAX_ATTACHMENT_FILE_COUNT) {
          return res.status(400).json({ message: `Maximum ${MAX_ATTACHMENT_FILE_COUNT} files allowed` });
        }
        const sectionKey = String(req.body?.sectionKey ?? "treatment").trim() || "treatment";
        const category = String(req.body?.category ?? "diagnostic").trim() || "diagnostic";
        const tempToken = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

        const uploaded: Array<Record<string, unknown>> = [];
        for (const file of files) {
          await dbRun(
            sql`INSERT INTO case_attachments
              (case_id, temp_token, section_key, category, file_name, mime_type, file_size, storage_path, created_by, created_at)
              VALUES (
                ${null},
                ${tempToken},
                ${sectionKey},
                ${category},
                ${file.originalname},
                ${file.mimetype},
                ${file.size},
                ${file.path},
                ${currentUser.id},
                ${new Date().toISOString()}
              )`,
          );
        }

        const rows = await dbAll<CaseAttachmentRow>(
          sql`SELECT id, case_id, section_key, category, file_name, mime_type, file_size, storage_path, created_at
            FROM case_attachments
            WHERE temp_token = ${tempToken}
            ORDER BY id ASC`,
        );
        for (const row of rows) {
          uploaded.push({
            id: row.id,
            caseId: row.case_id,
            sectionKey: row.section_key,
            category: row.category,
            fileName: row.file_name,
            mimeType: row.mime_type,
            fileSize: row.file_size,
            url: toAttachmentPublicUrl(row.id, currentUser.id),
            createdAt: row.created_at,
          });
        }

        return res.status(201).json({ tempToken, files: uploaded });
      } catch (err) {
        next(err);
      }
    },
  );

  app.delete("/api/case-attachments/temp/:id", requireAuth, requireAnyCapability("ast.case.create", "hospital.case.create"), async (req, res) => {
    const raw = req.params.id;
    const id = Number.parseInt(Array.isArray(raw) ? String(raw[0]) : String(raw), 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid attachment id" });
    }
    const currentUser = (req as AuthenticatedRequest).currentUser;
    const row = await dbGet<{ case_id: number | null; storage_path: string; created_by: number | null }>(
      sql`SELECT case_id, storage_path, created_by FROM case_attachments WHERE id = ${id}`,
    );
    if (!row) return res.status(404).json({ message: "Attachment not found" });
    if (row.case_id !== null) {
      return res.status(400).json({ message: "Attachment is already linked to a case" });
    }
    if (row.created_by !== currentUser.id) {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }
    try {
      if (row.storage_path && fs.existsSync(row.storage_path)) {
        fs.unlinkSync(row.storage_path);
      }
    } catch {
      // still remove DB row
    }
    await dbRun(sql`DELETE FROM case_attachments WHERE id = ${id}`);
    return res.status(204).end();
  });

  /**
   * Patient history endpoint — given a case id, return all OTHER cases that
   * look like they belong to the same owner.
   *
   * Matching strategy (v1, heuristic — there is no separate `owners` table
   * yet, so we de-dupe on the data we have):
   *   - Same `owner_phone` (normalised: digits only) — strongest signal.
   *   - Otherwise: same `owner_name` (case-insensitive, trimmed) AND same
   *     normalised owner_address.
   *
   * Returns cases across BOTH scopes (hospital + AST) when the requester can
   * view both — surgeons checking history want to see lab results from the
   * same patient and vice versa.
   */
  app.get("/api/cases/:id/patient-history", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    const scope = resolveCaseScopeQuery(req.query.scope) ?? "ast";
    if (!userCanViewScope(currentUser.role, scope)) {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }
    const caseId = getIdParam(req);
    const caseData = await caseRepo.getCase(caseId, scope, caseViewerAccess(currentUser));
    if (!caseData) return res.status(404).json({ message: MESSAGES.CASE_NOT_FOUND });

    const phoneDigits = String(caseData.ownerPhone || "").replace(/\D/g, "");
    const nameNorm = String(caseData.ownerName || "").trim().toLowerCase();
    const addrNorm = String(caseData.ownerAddress || "").trim().toLowerCase();

    if (!phoneDigits && !nameNorm) {
      return res.json([]);
    }

    type CaseLite = {
      id: number;
      case_number: string;
      date: string;
      owner_name: string;
      owner_address: string;
      owner_phone: string;
      species: string;
      breed: string;
      animal_name: string | null;
      created_at: string;
      registered_by: number | null;
    };

    const phoneNormSql = sql`REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(owner_phone, ''), ' ', ''), '-', ''), '(', ''), ')', '')`;
    const matchWhere =
      phoneDigits.length > 0 && nameNorm
        ? sql`(
            ${phoneNormSql} = ${phoneDigits}
            OR (LOWER(TRIM(owner_name)) = ${nameNorm} AND LOWER(TRIM(owner_address)) = ${addrNorm})
          )`
        : phoneDigits.length > 0
          ? sql`${phoneNormSql} = ${phoneDigits}`
          : sql`(LOWER(TRIM(owner_name)) = ${nameNorm} AND LOWER(TRIM(owner_address)) = ${addrNorm})`;

    const matches = await dbAll<CaseLite>(
      sql`SELECT id, case_number, date, owner_name, owner_address, owner_phone,
                 species, breed, animal_name, created_at, registered_by
          FROM cases
          WHERE id != ${caseId} AND ${matchWhere}
          ORDER BY created_at DESC
          LIMIT 50`,
    );

    // Scope-filter by what the user can view — never leak hospital data to
    // someone with only AST view rights, even though we matched on owner.
    // (Students are NOT restricted to their own cases here: see policy in
    // `caseViewerAccess()` — all roles with view capability see all cases.)
    const filtered = matches.filter((row) => {
      const rowScope = resolveCaseScopeFromCaseNumber(row.case_number);
      return userCanViewScope(currentUser.role, rowScope);
    });

    return res.json(
      filtered.slice(0, 100).map((row) => ({
        id: row.id,
        caseNumber: row.case_number,
        caseScope: resolveCaseScopeFromCaseNumber(row.case_number),
        date: row.date,
        ownerName: row.owner_name,
        ownerAddress: row.owner_address,
        ownerPhone: row.owner_phone,
        species: row.species,
        breed: row.breed,
        animalName: row.animal_name,
        createdAt: row.created_at,
      })),
    );
  });

  /**
   * Per-case edit history viewer endpoint.
   *
   * Returns the `case_change_logs` rows for a single case — created, updated
   * (with which fields), deleted. Any user who can VIEW the case can see its
   * history (no extra elevation), which matches user expectations: the same
   * audience that can read the data should be able to see who changed it.
   */
  app.get("/api/cases/:id/history", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    const scope = resolveCaseScopeQuery(req.query.scope) ?? "ast";
    if (!userCanViewScope(currentUser.role, scope)) {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }
    const caseId = getIdParam(req);
    const caseData = await caseRepo.getCase(caseId, scope, caseViewerAccess(currentUser));
    if (!caseData) return res.status(404).json({ message: MESSAGES.CASE_NOT_FOUND });
    const rows = await dbAll<CaseChangeLogRow>(
      sql`SELECT id, case_id, case_number, case_scope, action, actor_user_id, actor_role, actor_name, actor_username, created_at
          FROM case_change_logs
          WHERE case_id = ${caseId}
          ORDER BY id DESC
          LIMIT 500`,
    );
    return res.json(
      rows.map((row) => ({
        id: row.id,
        caseId: row.case_id,
        caseNumber: row.case_number,
        caseScope: row.case_scope,
        action: row.action,
        actorUserId: row.actor_user_id,
        actorRole: row.actor_role,
        actorName: row.actor_name,
        actorUsername: row.actor_username,
        createdAt: row.created_at,
      })),
    );
  });

  app.get("/api/cases/:id/attachments", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    const scope = resolveCaseScopeQuery(req.query.scope) ?? "ast";
    if (!userCanViewScope(currentUser.role, scope)) {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }
    const caseId = getIdParam(req);
    const caseData = await caseRepo.getCase(caseId, scope, caseViewerAccess(currentUser));
    if (!caseData) return res.status(404).json({ message: MESSAGES.CASE_NOT_FOUND });
    const rows = await dbAll<CaseAttachmentRow>(
      sql`SELECT id, case_id, section_key, category, file_name, mime_type, file_size, storage_path, created_at
          FROM case_attachments
          WHERE case_id = ${caseId}
          ORDER BY id ASC`,
    );
    return res.json(
      rows.map((row) => ({
        id: row.id,
        caseId: row.case_id,
        sectionKey: row.section_key,
        category: row.category,
        fileName: row.file_name,
        mimeType: row.mime_type,
        fileSize: row.file_size,
        url: toAttachmentPublicUrl(row.id, currentUser.id),
        createdAt: row.created_at,
      })),
    );
  });

  app.get("/api/cases/filter-options", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    const scope = resolveCaseScopeQuery(req.query.scope) ?? "ast";
    if (!userCanViewScope(currentUser.role, scope)) {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }
    const viewer = caseViewerAccess(currentUser);
    const options = await caseRepo.getDashboardFilterOptions(scope, viewer);
    return res.json({
      species: options.species,
      breeds: options.breeds,
      sexes: options.sexes,
      sampleTypes: options.sampleTypes,
    });
  });

  app.get("/api/cases", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    const scope = resolveCaseScopeQuery(req.query.scope) ?? "ast";
    if (!userCanViewScope(currentUser.role, scope)) {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }
    const pagination = getPaginationParams(req);
    const listFilters: CaseListFilters = {
      q: String(req.query.q ?? "").trim() || undefined,
      species: String(req.query.species ?? "").trim() || undefined,
      dateFrom: String(req.query.dateFrom ?? "").trim() || undefined,
      dateTo: String(req.query.dateTo ?? "").trim() || undefined,
    };
    const hasFilters = Boolean(
      listFilters.q || listFilters.species || listFilters.dateFrom || listFilters.dateTo,
    );

    const viewer = caseViewerAccess(currentUser);
    if (!pagination.shouldPaginate && !hasFilters) {
      return res.json(await caseRepo.getCases(scope, viewer));
    }

    const limit = pagination.pageSize;
    const offset = pagination.offset;
    const pageData = hasFilters
      ? await caseRepo.getCasesFilteredPage(limit, offset, scope, listFilters, viewer)
      : await caseRepo.getCasesPage(limit, offset, scope, viewer);
    return res.json({
      items: pageData.items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: pageData.total,
      totalPages: Math.max(1, Math.ceil(pageData.total / pagination.pageSize)),
    });
  });

  app.get("/api/cases/:id", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    const scope = resolveCaseScopeQuery(req.query.scope) ?? "ast";
    if (!userCanViewScope(currentUser.role, scope)) {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }
    const caseData = await caseRepo.getCase(getIdParam(req), scope, caseViewerAccess(currentUser));
    if (!caseData) return res.status(404).json({ message: MESSAGES.CASE_NOT_FOUND });
    res.json(caseData);
  });

  app.get("/api/cases/:id/pdf", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    const scope = resolveCaseScopeQuery(req.query.scope) ?? "ast";
    if (!userCanViewScope(currentUser.role, scope)) {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }
    const caseData = await caseRepo.getCase(getIdParam(req), scope, caseViewerAccess(currentUser));
    if (!caseData) return res.status(404).json({ message: MESSAGES.CASE_NOT_FOUND });

    const safeName = String(caseData.caseNumber || "case").replace(/[^\w.-]+/g, "_");
    try {
      const pdf = await buildCasePdfBuffer(caseData);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
      res.setHeader("Content-Length", String(pdf.length));
      res.send(pdf);
    } catch (err) {
      console.error({ type: "case_pdf_error", err: String(err) });
      return res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  app.get(
    "/api/next-case-info",
    requireAuth,
    requireAnyCapability("ast.case.create", "hospital.case.create"),
    async (req, res) => {
    const todayBs = getTodayBs();
    const scopeRaw = String(req.query.scope ?? "ast").toLowerCase();
    const scope: "ast" | "hospital" = scopeRaw === "hospital" ? "hospital" : "ast";
    const peek = await peekCaseIdentifiers(scope, todayBs);
    res.json({
      caseNumber: peek.caseNumber,
      dailyNumber: peek.dailyNumber,
      monthlyNumber: peek.monthlyNumber,
      yearlyNumber: peek.yearlyNumber,
      todayBs,
      todayAd: new Date().toISOString().split("T")[0],
    });
  });

  app.post("/api/cases", requireAuth, canRegisterHospital, async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).currentUser;
    const now = new Date().toISOString();
    const fullUser = await authSessionRepo.getUserById(user.id);
    const treatmentAttachmentIds = Array.isArray(req.body?.treatmentAttachmentIds)
      ? req.body.treatmentAttachmentIds
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isInteger(value) && value > 0)
      : [];
    if (treatmentAttachmentIds.length > MAX_ATTACHMENT_FILE_COUNT) {
      return res.status(400).json({ message: `Maximum ${MAX_ATTACHMENT_FILE_COUNT} attachments allowed` });
    }

    const parsed = insertCaseSchema.safeParse({
      ...req.body,
      registeredBy: user.id,
    });

    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: MESSAGES.INVALID_DATA, errors: parsed.error.flatten() });
    }
    if (resolveCaseScopeFromCaseNumber(parsed.data.caseNumber) !== "hospital") {
      return res.status(400).json({ message: "Hospital route requires CASE- prefixed case number" });
    }

    const dateValue = parsed.data.date;
    const scope: "hospital" = "hospital";
    const ids = await allocateCaseIdentifiers(scope, dateValue);

    const newCase = await caseRepo.createCase({
      ...parsed.data,
      caseNumber: ids.caseNumber,
      dailyNumber: ids.dailyNumber,
      monthlyNumber: ids.monthlyNumber,
      yearlyNumber: ids.yearlyNumber,
      astResults: "[]",
      lastUpdatedBy: user.id,
      lastUpdatedByName: fullUser?.fullName || `User ${user.id}`,
      updatedAt: now,
    });
    for (const attachmentId of treatmentAttachmentIds) {
      await dbRun(
        sql`UPDATE case_attachments
            SET case_id = ${newCase.id},
                temp_token = ${null}
            WHERE id = ${attachmentId}
              AND created_by = ${user.id}
              AND case_id IS NULL`,
      );
    }
    await dbRun(
      sql`INSERT INTO case_change_logs
          (case_id, case_number, case_scope, action, actor_user_id, actor_role, actor_name, actor_username, created_at)
          VALUES (
            ${newCase.id},
            ${newCase.caseNumber},
            ${"hospital"},
            ${"created"},
            ${user.id},
            ${user.role},
            ${fullUser?.fullName || `User ${user.id}`},
            ${fullUser?.username || ""},
            ${new Date().toISOString()}
          )`,
    );

    try {
      await ensureMedicationsFromTreatmentDetails(newCase.treatmentDetails);
    } catch (catalogError) {
      console.warn("[catalog] medication sync after hospital case create failed", catalogError);
    }

    res.status(201).json(newCase);
  });

  app.post("/api/ast/cases", requireAuth, canRegister, async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).currentUser;
    const now = new Date().toISOString();
    const fullUser = await authSessionRepo.getUserById(user.id);
    const treatmentAttachmentIds = Array.isArray(req.body?.treatmentAttachmentIds)
      ? req.body.treatmentAttachmentIds
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isInteger(value) && value > 0)
      : [];
    if (treatmentAttachmentIds.length > MAX_ATTACHMENT_FILE_COUNT) {
      return res.status(400).json({ message: `Maximum ${MAX_ATTACHMENT_FILE_COUNT} attachments allowed` });
    }

    const parsed = insertCaseSchema.safeParse({
      ...req.body,
      registeredBy: user.id,
    });

    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: MESSAGES.INVALID_DATA, errors: parsed.error.flatten() });
    }
    if (resolveCaseScopeFromCaseNumber(parsed.data.caseNumber) !== "ast") {
      return res.status(400).json({ message: "AST route requires AST- prefixed case number" });
    }

    const dateValue = parsed.data.date;
    const scope: "ast" = "ast";
    const ids = await allocateCaseIdentifiers(scope, dateValue);

    const newCase = await caseRepo.createCase({
      ...parsed.data,
      caseNumber: ids.caseNumber,
      dailyNumber: ids.dailyNumber,
      monthlyNumber: ids.monthlyNumber,
      yearlyNumber: ids.yearlyNumber,
      lastUpdatedBy: user.id,
      lastUpdatedByName: fullUser?.fullName || `User ${user.id}`,
      updatedAt: now,
    });
    for (const attachmentId of treatmentAttachmentIds) {
      await dbRun(
        sql`UPDATE case_attachments
            SET case_id = ${newCase.id},
                temp_token = ${null}
            WHERE id = ${attachmentId}
              AND created_by = ${user.id}
              AND case_id IS NULL`,
      );
    }
    await dbRun(
      sql`INSERT INTO case_change_logs
          (case_id, case_number, case_scope, action, actor_user_id, actor_role, actor_name, actor_username, created_at)
          VALUES (
            ${newCase.id},
            ${newCase.caseNumber},
            ${"ast"},
            ${"created"},
            ${user.id},
            ${user.role},
            ${fullUser?.fullName || `User ${user.id}`},
            ${fullUser?.username || ""},
            ${new Date().toISOString()}
          )`,
    );

    res.status(201).json(newCase);
  });

  app.patch("/api/cases/:id", requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).currentUser;
    const now = new Date().toISOString();
    const fullUser = await authSessionRepo.getUserById(user.id);
    const scope = resolveCaseScopeQuery(req.query.scope) ?? "ast";
    if (!userCanEditScope(user.role, scope)) {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }
    const caseId = getIdParam(req);
    const existing = await caseRepo.getCase(caseId, scope, caseViewerAccess(user));
    if (!existing) {
      return res.status(404).json({ message: MESSAGES.CASE_NOT_FOUND });
    }
    // Defence in depth: `patchCaseSchema` already drops `caseNumber` from
    // accepted patches, but if the client tried to *change* it we want to
    // be loud about refusing — silently dropping a caseNumber change could
    // confuse a caller who thinks they renumbered a case. A no-op
    // `caseNumber === existing.caseNumber` is allowed because clients
    // commonly re-send the read value in their PATCH body.
    if (typeof req.body?.caseNumber === "string" && req.body.caseNumber.trim()) {
      const submitted = req.body.caseNumber.trim();
      if (submitted !== existing.caseNumber) {
        const nextScope = resolveCaseScopeFromCaseNumber(submitted);
        if (nextScope !== scope) {
          return res.status(400).json({
            message: "caseNumber cannot move a case across AST/Hospital scopes",
          });
        }
        return res.status(400).json({
          message: "caseNumber cannot be modified via PATCH",
        });
      }
    }

    const parsed = patchCaseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: MESSAGES.INVALID_DATA, errors: parsed.error.flatten() });
    }
    const patch = parsed.data;

    const updated = await caseRepo.updateCase(
      caseId,
      {
        ...patch,
        lastUpdatedBy: user.id,
        lastUpdatedByName: fullUser?.fullName || `User ${user.id}`,
        updatedAt: now,
      },
      scope,
      caseViewerAccess(user),
    );

    if (!updated) {
      return res.status(404).json({ message: MESSAGES.CASE_NOT_FOUND });
    }

    const changedFieldKeys = computeChangedCaseFieldKeys(existing, updated);
    if (changedFieldKeys.length > 0) {
      await dbRun(
        sql`INSERT INTO case_change_logs
            (case_id, case_number, case_scope, action, actor_user_id, actor_role, actor_name, actor_username, created_at)
            VALUES (
              ${updated.id},
              ${updated.caseNumber},
              ${scope},
              ${`updated:${changedFieldKeys.join(",")}`},
              ${user.id},
              ${user.role},
              ${fullUser?.fullName || `User ${user.id}`},
              ${fullUser?.username || ""},
              ${new Date().toISOString()}
            )`,
      );
    }

    if (scope === "hospital") {
      try {
        await ensureMedicationsFromTreatmentDetails(updated.treatmentDetails);
      } catch (catalogError) {
        console.warn("[catalog] medication sync after hospital case update failed", catalogError);
      }
    }

    res.json(updated);
  });

  app.delete(
    "/api/cases/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const scope = resolveCaseScopeQuery(req.query.scope) ?? "ast";
      const existing = await caseRepo.getCase(getIdParam(req), scope, caseViewerAccess(currentUser));
      if (!existing) {
        return res.status(404).json({ message: MESSAGES.CASE_NOT_FOUND });
      }
      const attachmentRows = await dbAll<{ id: number; storage_path: string }>(
        sql`SELECT id, storage_path FROM case_attachments WHERE case_id = ${existing.id}`,
      );
      await caseRepo.deleteCase(getIdParam(req), scope);
      await dbRun(sql`DELETE FROM case_attachments WHERE case_id = ${existing.id}`);
      for (const attachment of attachmentRows) {
        if (attachment.storage_path && fs.existsSync(attachment.storage_path)) {
          try {
            fs.unlinkSync(attachment.storage_path);
          } catch {
            // Ignore storage cleanup failures; DB row is already removed.
          }
        }
      }
      const actor = await authSessionRepo.getUserById(currentUser.id);
      await dbRun(
        sql`INSERT INTO case_change_logs
            (case_id, case_number, case_scope, action, actor_user_id, actor_role, actor_name, actor_username, created_at)
            VALUES (
              ${existing.id},
              ${existing.caseNumber},
              ${scope ?? resolveCaseScopeFromCaseNumber(existing.caseNumber)},
              ${"deleted"},
              ${currentUser.id},
              ${currentUser.role},
              ${actor?.fullName || `User ${currentUser.id}`},
              ${actor?.username || ""},
              ${new Date().toISOString()}
            )`,
      );
      res.json({ message: "Case deleted" });
    },
  );
}

export function registerExportRoutes(app: Express) {
  /** Students: atomically consume approval before generating export (prevents parallel double-spend). */
  const consumeStudentExportApproval = async (
    req: Request,
    res: Response,
  ): Promise<boolean> => {
    const user = (req as AuthenticatedRequest).currentUser;
    if (!user || user.role !== "student") return true;
    const approved = (req as AuthenticatedRequest).approvedDownloadRequest;
    if (!approved) {
      res.status(403).json({
        message:
          "Download access not approved for this date range. Please submit a new download request.",
      });
      return false;
    }
    const consumed = await consumeApprovedDownloadRequest(approved.id, user.id);
    if (!consumed) {
      res.status(403).json({
        message:
          "This download approval was already used (or is no longer valid). Please submit a new request.",
      });
      return false;
    }
    return true;
  };

  app.get("/api/export/cases", requireAuth, canDownload, async (req: Request, res: Response) => {
    const output = parseExportOutput((req.query as { output?: string }).output);
    if (!output) {
      return res.status(400).json({ message: "Invalid output (use csv or xlsx)" });
    }
    if (!(await consumeStudentExportApproval(req, res))) return;

    const { dateFrom, dateTo, species } = parseExportQueryFilters(
      req.query as Record<string, unknown>,
    );
    const currentUser = (req as AuthenticatedRequest).currentUser;
    const viewer = caseViewerAccess(currentUser);
    const casesData = await caseRepo.getCasesByDateRangeAndScope(
      "ast",
      dateFrom,
      dateTo,
      viewer,
      species,
    );
    console.info(
      `[export] scope=ast user=${currentUser.id} role=${currentUser.role} dateFrom=${dateFrom || "*"} dateTo=${dateTo || "*"} species=${species || "*"} matched=${casesData.length}`,
    );
    const format =
      typeof (req.query as { format?: string }).format === "string"
        ? String((req.query as { format?: string }).format).toLowerCase()
        : "wide";
    const rows =
      format === "long" ? toAstLongExportRows(casesData) : toAstWideExportRows(casesData);
    const columnOrder =
      format === "long" ? astLongExportColumnOrder() : astWideExportColumnOrder();

    const baseName = buildExportCsvFilename({
      scope: "ast",
      dateFrom,
      dateTo,
      astLayout: format === "long" ? "long" : "wide",
      species,
    }).replace(/\.csv$/i, "");

    res.setHeader("X-Export-Row-Count", String(rows.length));
    res.setHeader("Cache-Control", "no-store");

    if (output === "xlsx") {
      const { rowsToXlsxBuffer } = await import("./cases-export-xlsx");
      const buf = await rowsToXlsxBuffer(
        rows,
        columnOrder,
        format === "long" ? "AST cases (long)" : "AST cases (wide)",
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", `attachment; filename="${baseName}.xlsx"`);
      return res.send(buf);
    }

    const csvContent = rowsToCsv(rows, columnOrder);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.csv"`);
    return res.send(csvContent);
  });

  app.get(
    "/api/export/hospital-cases",
    requireAuth,
    canDownloadHospital,
    async (req: Request, res: Response) => {
      const output = parseExportOutput((req.query as { output?: string }).output);
      if (!output) {
        return res.status(400).json({ message: "Invalid output (use csv or xlsx)" });
      }
      if (!(await consumeStudentExportApproval(req, res))) return;

      const { dateFrom, dateTo, species } = parseExportQueryFilters(
        req.query as Record<string, unknown>,
      );
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const viewer = caseViewerAccess(currentUser);
      const casesData = await caseRepo.getCasesByDateRangeAndScope(
        "hospital",
        dateFrom,
        dateTo,
        viewer,
        species,
      );
      console.info(
        `[export] scope=hospital user=${currentUser.id} role=${currentUser.role} dateFrom=${dateFrom || "*"} dateTo=${dateTo || "*"} species=${species || "*"} matched=${casesData.length}`,
      );
      const rows = toHospitalExportRows(casesData);
      const columnOrder = hospitalExportColumnOrder(rows);

      const baseName = buildExportCsvFilename({
        scope: "hospital",
        dateFrom,
        dateTo,
        species,
      }).replace(/\.csv$/i, "");

      res.setHeader("X-Export-Row-Count", String(rows.length));
      res.setHeader("Cache-Control", "no-store");

      if (output === "xlsx") {
        const { rowsToXlsxBuffer } = await import("./cases-export-xlsx");
        const buf = await rowsToXlsxBuffer(rows, columnOrder, "Hospital cases");
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.setHeader("Content-Disposition", `attachment; filename="${baseName}.xlsx"`);
        return res.send(buf);
      }

      const csvContent = rowsToCsv(rows, columnOrder);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${baseName}.csv"`);
      return res.send(csvContent);
    },
  );
}
