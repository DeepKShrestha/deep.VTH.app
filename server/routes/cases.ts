import type { Express, Request, Response } from "express";
import { insertCaseSchema } from "@shared/schema";
import { sql } from "drizzle-orm";
import { dbAll, dbGet, dbRun } from "../db-query";
import { caseRepo } from "../case-repo";
import { authSessionRepo } from "../auth-session-repo";
import {
  canDownload,
  canRegister,
  getIdParam,
  getPaginationParams,
  getTodayBs,
  isDashboardVisibleForRole,
  requireAuth,
  requireRole,
} from "./context";
import type { AuthenticatedRequest } from "./types";
import { MESSAGES } from "./messages";
import { rowsToCsv, toExportRows } from "./cases-export";

type DownloadRequestRow = {
  id: number;
  user_id: number;
  date_from: string | null;
  date_to: string | null;
  reason: string | null;
  status: string;
  admin_note: string | null;
  resolved_by: number | null;
  created_at: string;
  resolved_at: string | null;
};

function toDownloadRequest(row: DownloadRequestRow) {
  return {
    id: row.id,
    userId: row.user_id,
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

export function registerCaseAndDownloadRoutes(app: Express) {
  app.get("/api/dashboard/summary", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    if (!(await isDashboardVisibleForRole(currentUser.role))) {
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

    const allCases = await caseRepo.getCases();
    const speciesSet = new Set<string>();
    const breedSet = new Set<string>();
    const sexSet = new Set<string>();
    const sampleTypeSet = new Set<string>();
    const organismSet = new Set<string>();
    const antibioticSet = new Set<string>();

    const caseBase = allCases.filter((c) => {
      const species = String(c.species || "Unknown").trim() || "Unknown";
      const breed = String(c.breed || "Unknown").trim() || "Unknown";
      const sex = String(c.sex || "Unknown").trim() || "Unknown";
      const sampleType = String(c.sampleType || "Unknown").trim() || "Unknown";
      const organism = String(c.cultureResult || "").trim();
      speciesSet.add(species);
      breedSet.add(breed);
      sexSet.add(sex);
      sampleTypeSet.add(sampleType);
      if (organism) organismSet.add(organism);

      const sampleDate = String(c.sampleDateAd || c.sampleDate || c.dateAd || "").trim();
      const sampleTs = dateToTs(sampleDate);
      if (effectiveStartTs != null && sampleTs != null && sampleTs < effectiveStartTs)
        return false;
      if (effectiveEndTs != null && sampleTs != null && sampleTs > effectiveEndTs) return false;
      if (speciesFilter !== "all" && species !== speciesFilter) return false;
      if (breedFilter !== "all" && breed !== breedFilter) return false;
      if (sexFilter !== "all" && sex !== sexFilter) return false;
      if (sampleTypeFilter !== "all" && sampleType !== sampleTypeFilter) return false;
      if (organismFilter !== "all" && organism !== organismFilter) return false;
      return true;
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
      if (antibioticFilter !== "all" && r.antibiotic !== antibioticFilter) return false;
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

  app.get("/api/species-options", requireAuth, canRegister, async (_req, res) => {
    const rows = await dbAll<{ name: string }>(
      sql`SELECT name FROM species_options ORDER BY name ASC`,
    );
    res.json(rows.map((r) => r.name));
  });

  app.get("/api/breed-options", requireAuth, canRegister, async (req, res) => {
    const species = String(req.query.species ?? "").trim();
    if (!species) return res.json([]);
    const rows = await dbAll<{ name: string }>(
      sql`SELECT name FROM breed_options WHERE species_name = ${species} ORDER BY name ASC`,
    );
    res.json(rows.map((r) => r.name));
  });

  app.get("/api/form-config", requireAuth, canRegister, async (_req, res) => {
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

  app.get("/api/form-definition", requireAuth, canRegister, async (_req, res) => {
    const sections = await dbAll<{ key: string; title: string; display_order: number }>(
      sql`SELECT key, title, display_order FROM form_sections ORDER BY display_order ASC`,
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
      display_order: number;
      is_builtin: number;
    }>(
      sql`SELECT id, key, section_key, label, input_type, options_json, enabled, required, display_order, is_builtin
          FROM form_questions
          ORDER BY section_key ASC, display_order ASC`,
    );
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
        questions: (bySection.get(s.key) ?? []).map((q) => ({
          id: q.id,
          key: q.key,
          label: q.label,
          inputType: q.input_type,
          options: q.options_json ? JSON.parse(q.options_json) : [],
          enabled: Boolean(q.enabled),
          required: Boolean(q.required),
          displayOrder: q.display_order,
          isBuiltin: Boolean(q.is_builtin),
        })),
      })),
    });
  });

  app.post("/api/download-requests", requireAuth, async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).currentUser;
    const { dateFrom, dateTo, reason } = req.body;
    await dbRun(
      sql`INSERT INTO download_requests
          (user_id, date_from, date_to, reason, status, created_at)
          VALUES (
            ${user.id},
            ${dateFrom || null},
            ${dateTo || null},
            ${reason || null},
            ${"pending"},
            ${new Date().toISOString()}
          )`,
    );
    const created = await dbGet<DownloadRequestRow>(
      sql`SELECT id, user_id, date_from, date_to, reason, status, admin_note, resolved_by, created_at, resolved_at
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
        sql`SELECT id, user_id, date_from, date_to, reason, status, admin_note, resolved_by, created_at, resolved_at
            FROM download_requests
            WHERE user_id = ${user.id}
            ORDER BY created_at DESC`,
      );
      res.json(rows.map(toDownloadRequest));
    },
  );

  app.get("/api/cases", requireAuth, async (req, res) => {
    const pagination = getPaginationParams(req);
    if (!pagination.shouldPaginate) {
      return res.json(await caseRepo.getCases());
    }
    const pageData = await caseRepo.getCasesPage(pagination.pageSize, pagination.offset);
    return res.json({
      items: pageData.items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: pageData.total,
      totalPages: Math.max(1, Math.ceil(pageData.total / pagination.pageSize)),
    });
  });

  app.get("/api/cases/:id", requireAuth, async (req, res) => {
    const caseData = await caseRepo.getCase(getIdParam(req));
    if (!caseData) return res.status(404).json({ message: MESSAGES.CASE_NOT_FOUND });
    res.json(caseData);
  });

  app.get("/api/next-case-info", requireAuth, canRegister, async (_req, res) => {
    const todayBs = getTodayBs();
    const bsYearMonth = todayBs.substring(0, 7);
    res.json({
      caseNumber: await caseRepo.getNextCaseNumber(),
      dailyNumber: await caseRepo.getDailyNumber(todayBs),
      monthlyNumber: await caseRepo.getMonthlyNumber(bsYearMonth),
      todayBs,
      todayAd: new Date().toISOString().split("T")[0],
    });
  });

  app.post("/api/cases", requireAuth, canRegister, async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).currentUser;
    const now = new Date().toISOString();
    const fullUser = await authSessionRepo.getUserById(user.id);

    const parsed = insertCaseSchema.safeParse({
      ...req.body,
      registeredBy: user.id,
    });

    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: MESSAGES.INVALID_DATA, errors: parsed.error.flatten() });
    }

    const newCase = await caseRepo.createCase({
      ...parsed.data,
      lastUpdatedBy: user.id,
      lastUpdatedByName: fullUser?.fullName || `User ${user.id}`,
      updatedAt: now,
    });

    res.status(201).json(newCase);
  });

  app.patch("/api/cases/:id", requireAuth, canRegister, async (req, res) => {
    const user = (req as AuthenticatedRequest).currentUser;
    const now = new Date().toISOString();
    const fullUser = await authSessionRepo.getUserById(user.id);

    const updated = await caseRepo.updateCase(getIdParam(req), {
      ...req.body,
      lastUpdatedBy: user.id,
      lastUpdatedByName: fullUser?.fullName || `User ${user.id}`,
      updatedAt: now,
    });

    if (!updated) {
      return res.status(404).json({ message: MESSAGES.CASE_NOT_FOUND });
    }

    res.json(updated);
  });

  app.delete(
    "/api/cases/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const existing = await caseRepo.getCase(getIdParam(req));
      if (!existing) {
        return res.status(404).json({ message: MESSAGES.CASE_NOT_FOUND });
      }
      await caseRepo.deleteCase(getIdParam(req));
      res.json({ message: "Case deleted" });
    },
  );
}

export function registerExportRoutes(app: Express) {
  app.get("/api/export/cases", requireAuth, canDownload, async (req: Request, res: Response) => {
    const { dateFrom, dateTo } = req.query as {
      dateFrom?: string;
      dateTo?: string;
    };
    const casesData = await caseRepo.getCasesByDateRange(dateFrom, dateTo);
    const rows = toExportRows(casesData);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=ast-cases.csv");

    const csvContent = rowsToCsv(rows);

    const approvedReq = (req as AuthenticatedRequest).approvedDownloadRequest;

    if (approvedReq) {
      await dbRun(
        sql`UPDATE download_requests
            SET status = ${"downloaded"},
                admin_note = ${"Download used"},
                resolved_at = ${new Date().toISOString()}
            WHERE id = ${approvedReq.id}`,
      );
    }

    return res.send(csvContent);
  });
}
