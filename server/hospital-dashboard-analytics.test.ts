import { describe, expect, it } from "vitest";
import type { Case } from "@shared/schema";
import {
  computeHospitalDashboard,
  flattenMedications,
  parseCustomFields,
  parseTreatmentDetails,
  resolvePeriodWindow,
  timeKeyForGroup,
} from "./hospital-dashboard-analytics";

function makeCase(overrides: Partial<Case>): Case {
  return {
    id: 1,
    caseNumber: "CASE-001",
    billNumber: null,
    dailyNumber: null,
    monthlyNumber: null,
    yearlyNumber: null,
    date: "2081-01-15",
    dateAd: "2024-04-27",
    ownerName: "Owner A",
    ownerAddress: "Kathmandu",
    ownerPhone: "9800000001",
    species: "Dog",
    breed: "Labrador",
    animalName: "Rex",
    age: "3",
    sex: "Male",
    sampleType: null,
    sampleDate: null,
    sampleDateAd: null,
    cultureResult: null,
    astResults: null,
    remarks: null,
    registeredBy: 1,
    createdAt: "2024-04-27T09:30:00.000Z",
    lastUpdatedBy: null,
    lastUpdatedByName: null,
    updatedAt: null,
    customFields: null,
    treatmentDetails: null,
    veterinarianId: null,
    veterinarianName: "Dr Sharma",
    veterinarianNvc: null,
    veterinarianDepartment: "Small Animal",
    ...overrides,
  };
}

describe("hospital-dashboard-analytics helpers", () => {
  it("parseCustomFields returns {} for invalid JSON", () => {
    expect(parseCustomFields(null)).toEqual({});
    expect(parseCustomFields("")).toEqual({});
    expect(parseCustomFields("not-json")).toEqual({});
    expect(parseCustomFields(JSON.stringify({ a: 1 }))).toEqual({ a: 1 });
  });

  it("flattenMedications drops entries with no medication name", () => {
    const raw = JSON.stringify({
      q1: {
        medications: [
          { medication: "Amoxicillin", dose: "10", route: "PO" },
          { medication: "", dose: "5" },
          null,
        ],
      },
      q2: {
        medications: [{ medication: "Meloxicam", route: "SC" }],
      },
    });
    const out = flattenMedications(parseTreatmentDetails(raw));
    expect(out.map((m) => m.medication)).toEqual(["Amoxicillin", "Meloxicam"]);
  });

  it("timeKeyForGroup buckets by day/week/month/year", () => {
    expect(timeKeyForGroup("2024-04-15", "day")).toBe("2024-04-15");
    expect(timeKeyForGroup("2024-04-15", "week")).toBe("2024-04-W3");
    expect(timeKeyForGroup("2024-04-15", "month")).toBe("2024-04");
    expect(timeKeyForGroup("2024-04-15", "year")).toBe("2024");
    expect(timeKeyForGroup("invalid", "month")).toBe("invalid");
  });
});

describe("computeHospitalDashboard", () => {
  const now = new Date("2024-04-27T10:00:00Z");
  const medMap = new Map<string, string>([
    ["amoxicillin", "Antibiotic"],
    ["meloxicam", "NSAID"],
    ["ivermectin", "Anthelmintic"],
  ]);

  function fixtureCases(): Case[] {
    return [
      makeCase({
        id: 1,
        caseNumber: "CASE-001",
        species: "Dog",
        sex: "Male",
        age: "3",
        veterinarianName: "Dr Sharma",
        veterinarianDepartment: "Small Animal",
        ownerPhone: "9800000001",
        date: "2081-01-15",
        dateAd: "2024-04-27",
        createdAt: "2024-04-27T09:30:00.000Z",
        customFields: JSON.stringify({
          temperature: "39.2",
          heartRate: "120",
          respiratoryRate: "30",
          weight: "12",
          dehydrationPercentage: "6",
          chiefComplaint: "Vomiting and lethargy",
          diagnosis: "Gastroenteritis",
          testsSuggested: ["CBC", "Biochemistry"],
          rapidDiagnosticTests: ["Parvo Ag"],
          xrayDetails: "Lateral abdomen",
        }),
        treatmentDetails: JSON.stringify({
          q1: {
            medications: [
              { medication: "Amoxicillin", route: "PO" },
              { medication: "Meloxicam", route: "SC" },
            ],
          },
        }),
      }),
      makeCase({
        id: 2,
        caseNumber: "CASE-002",
        species: "Cat",
        sex: "Female",
        age: "1",
        veterinarianName: "Dr Karki",
        veterinarianDepartment: "Small Animal",
        ownerPhone: "9800000001", // same owner as case 1 → repeat visit
        date: "2081-01-16",
        dateAd: "2024-04-28",
        createdAt: "2024-04-28T11:15:00.000Z",
        customFields: JSON.stringify({
          temperature: "38.5",
          chiefComplaint: "vomiting and lethargy", // same complaint, different case
          diagnosis: "URI",
          testsSuggested: ["CBC"],
          ultrasoundDetails: "Abdominal",
        }),
        treatmentDetails: JSON.stringify({
          q1: {
            medications: [{ medication: "Amoxicillin", route: "PO" }],
          },
        }),
      }),
      makeCase({
        id: 3,
        caseNumber: "CASE-003",
        species: "Chicken",
        sex: "Female",
        age: "0.5",
        veterinarianName: "Dr Thapa",
        veterinarianDepartment: "Poultry",
        ownerPhone: "9800000002",
        date: "2081-01-10",
        dateAd: "2024-04-22",
        createdAt: "2024-04-22T08:00:00.000Z",
        customFields: JSON.stringify({
          flockSize: "1000",
          mortality: "25",
          hatchery: "Sunrise Hatchery",
          feedSupplier: "Acme Feeds",
          chiefComplaint: "Sudden death",
          testsSuggested: ["Post-mortem"],
        }),
        treatmentDetails: null,
      }),
    ];
  }

  it("computes overview KPIs", () => {
    const out = computeHospitalDashboard({
      cases: fixtureCases(),
      groupBy: "day",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
    });
    expect(out.overview.totalCases).toBe(3);
    expect(out.overview.casesToday).toBe(1); // only the AD=2024-04-27 case
    expect(out.overview.casesThisMonth).toBe(3);
    expect(out.overview.casesThisYear).toBe(3);
    expect(out.overview.distinctOwners).toBe(2);
    expect(out.overview.repeatVisitRatePct).toBeGreaterThan(0); // phone shared between 2 cases
    expect(out.overview.activeVets).toBe(3);
    expect(out.overview.activeDepartments).toBe(2);
    expect(out.overview.totalPrescriptions).toBe(3);
    expect(out.overview.totalTestsOrdered).toBeGreaterThanOrEqual(6);
    expect(out.overview.mostCommonSpecies).toBeDefined();
    expect(out.overview.mostPrescribedMedication).toBe("Amoxicillin");
  });

  it("groups composition by species/department/weekday", () => {
    const out = computeHospitalDashboard({
      cases: fixtureCases(),
      groupBy: "month",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
    });
    const species = Object.fromEntries(out.composition.casesBySpecies.map((kv) => [kv.name, kv.value]));
    expect(species.Dog).toBe(1);
    expect(species.Cat).toBe(1);
    expect(species.Chicken).toBe(1);
    const depts = Object.fromEntries(out.composition.casesByDepartment.map((kv) => [kv.name, kv.value]));
    expect(depts["Small Animal"]).toBe(2);
    expect(depts.Poultry).toBe(1);
    const weekdays = out.composition.casesByWeekday;
    expect(weekdays).toHaveLength(7);
    expect(weekdays.reduce((acc, kv) => acc + kv.value, 0)).toBe(3);
  });

  it("buckets dehydration + summarises vitals", () => {
    const out = computeHospitalDashboard({
      cases: fixtureCases(),
      groupBy: "month",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
    });
    const tempVital = out.clinical.vitals.find((v) => v.name === "Temperature");
    expect(tempVital).toBeDefined();
    expect(tempVital!.count).toBe(2);
    expect(tempVital!.median).toBeGreaterThan(38);
    const dehy = Object.fromEntries(out.clinical.dehydrationBuckets.map((kv) => [kv.name, kv.value]));
    expect(dehy["5-10%"]).toBe(1);
  });

  it("groups free-text complaints case-insensitively", () => {
    const out = computeHospitalDashboard({
      cases: fixtureCases(),
      groupBy: "month",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
    });
    const merged = out.clinical.topChiefComplaints.find((c) =>
      c.name.toLowerCase() === "vomiting and lethargy",
    );
    expect(merged?.value).toBe(2);
  });

  it("exposes a top-antibiotics list restricted to antibiotic-class meds", () => {
    const out = computeHospitalDashboard({
      cases: fixtureCases(),
      groupBy: "month",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
    });
    // Fixture has Amoxicillin × 2 (antibiotic), Meloxicam × 1 (NSAID)
    const topAbx = out.therapeutics.topAntibiotics;
    expect(topAbx.map((kv) => kv.name)).toEqual(["Amoxicillin"]);
    expect(topAbx[0].value).toBe(2);
    expect(topAbx.some((kv) => kv.name === "Meloxicam")).toBe(false);
  });

  it("classifies medications by therapeutic class", () => {
    const out = computeHospitalDashboard({
      cases: fixtureCases(),
      groupBy: "month",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
    });
    const classes = Object.fromEntries(
      out.therapeutics.medicationClassMix.map((kv) => [kv.name, kv.value]),
    );
    expect(classes.Antibiotic).toBe(2); // Amoxicillin × 2
    expect(classes.NSAID).toBe(1); // Meloxicam × 1
  });

  it("builds a ranked medication list with shares + cumulative shares", () => {
    const out = computeHospitalDashboard({
      cases: fixtureCases(),
      groupBy: "month",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
    });
    const ranking = out.therapeutics.medicationRanking;
    // Two drugs prescribed across all cases (Amoxicillin × 2, Meloxicam × 1).
    expect(ranking.map((r) => r.name)).toEqual(["Amoxicillin", "Meloxicam"]);
    expect(ranking[0]).toMatchObject({
      rank: 1,
      name: "Amoxicillin",
      count: 2,
      class: "Antibiotic",
      isAntibiotic: true,
    });
    expect(ranking[1]).toMatchObject({
      rank: 2,
      name: "Meloxicam",
      count: 1,
      class: "NSAID",
      isAntibiotic: false,
    });
    // 2/3 ≈ 66.7% share, then +33.3% gets us to 100% cumulative.
    expect(ranking[0].sharePct).toBeCloseTo(66.7, 1);
    expect(ranking[0].cumulativeSharePct).toBeCloseTo(66.7, 1);
    expect(ranking[1].cumulativeSharePct).toBeCloseTo(100, 1);
  });

  it("attaches the most-common diagnosis to each ranked medication", () => {
    const out = computeHospitalDashboard({
      cases: fixtureCases(),
      groupBy: "month",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
    });
    const ranking = out.therapeutics.medicationRanking;
    const amox = ranking.find((r) => r.name === "Amoxicillin");
    const melox = ranking.find((r) => r.name === "Meloxicam");
    // Amoxicillin appears with both Gastroenteritis and URI (one each).
    // Tie-break is "first seen" via Map iteration order, so we only assert
    // that *some* diagnosis was recorded and the count is 1.
    expect(amox?.topDiagnosis).not.toBeNull();
    expect(amox?.topDiagnosis?.count).toBe(1);
    expect(["Gastroenteritis", "Uri"]).toContain(amox?.topDiagnosis?.name);
    // Meloxicam only appears on the Gastroenteritis case.
    expect(melox?.topDiagnosis).toEqual({ name: "Gastroenteritis", count: 1 });
  });

  it("detects avian data and computes mortality rate", () => {
    const out = computeHospitalDashboard({
      cases: fixtureCases(),
      groupBy: "month",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
    });
    expect(out.avian.hasAvianData).toBe(true);
    expect(out.avian.totalFlock).toBe(1000);
    expect(out.avian.totalMortality).toBe(25);
    expect(out.avian.mortalityRatePct).toBeCloseTo(2.5, 1);
    expect(out.avian.topHatcheries[0]?.name).toBe("Sunrise Hatchery");
  });

  it("avianOnly filter narrows the result set", () => {
    const out = computeHospitalDashboard({
      cases: fixtureCases(),
      groupBy: "month",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: true },
      now,
    });
    expect(out.overview.totalCases).toBe(1);
    expect(out.composition.casesBySpecies[0]?.name).toBe("Chicken");
  });

  it("medicationClass filter keeps only matching cases", () => {
    const out = computeHospitalDashboard({
      cases: fixtureCases(),
      groupBy: "month",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "NSAID", avianOnly: false },
      now,
    });
    expect(out.overview.totalCases).toBe(1); // only case 1 has Meloxicam
    expect(out.drilldownRows[0]?.caseNumber).toBe("CASE-001");
  });

  it("department filter keeps only matching cases", () => {
    const out = computeHospitalDashboard({
      cases: fixtureCases(),
      groupBy: "month",
      medicationClassByName: medMap,
      filters: { department: "Poultry", vet: "all", medicationClass: "all", avianOnly: false },
      now,
    });
    expect(out.overview.totalCases).toBe(1);
    expect(out.drilldownRows[0]?.department).toBe("Poultry");
  });

  it("department filter is case-insensitive", () => {
    const out = computeHospitalDashboard({
      cases: fixtureCases(),
      groupBy: "month",
      medicationClassByName: medMap,
      filters: { department: "poultry", vet: "all", medicationClass: "all", avianOnly: false },
      now,
    });
    expect(out.overview.totalCases).toBe(1);
    expect(out.drilldownRows[0]?.department).toBe("Poultry");
  });

  it("drilldownRows expose computed counts", () => {
    const out = computeHospitalDashboard({
      cases: fixtureCases(),
      groupBy: "month",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
    });
    const row1 = out.drilldownRows.find((r) => r.caseNumber === "CASE-001");
    expect(row1?.medicationsCount).toBe(2);
    expect(row1?.testsOrderedCount).toBeGreaterThanOrEqual(4);
  });

  it("returns empty buckets without crashing on no data", () => {
    const out = computeHospitalDashboard({
      cases: [],
      groupBy: "month",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
    });
    expect(out.overview.totalCases).toBe(0);
    expect(out.composition.casesBySpecies).toEqual([]);
    expect(out.avian.hasAvianData).toBe(false);
    expect(out.trends.casesOverTime).toEqual([]);
    expect(out.kpis).toHaveLength(4);
    expect(out.secondaryKpis).toHaveLength(2);
    expect(out.kpis.map((k) => k.id)).toEqual([
      "cases",
      "owners",
      "meds_per_case",
      "diagnosis_pct",
    ]);
    expect(out.secondaryKpis.map((k) => k.id)).toEqual([
      "abx_share",
      "tests_per_case",
    ]);
    expect(out.insights).toEqual([]);
    expect(out.dataQuality.totalCases).toBe(0);
    // Payload must not expose clinicalAlerts any more.
    expect((out as Record<string, unknown>).clinicalAlerts).toBeUndefined();
    // medicationRanking should be present but empty when there are no cases.
    expect(out.therapeutics.medicationRanking).toEqual([]);
  });
});

describe("resolvePeriodWindow", () => {
  const now = new Date("2024-05-15T12:00:00Z");

  it("resolves '30d' to a 30-day current window with same-length prior", () => {
    const w = resolvePeriodWindow({ preset: "30d", now });
    expect(w.current.days).toBe(30);
    expect(w.prior.days).toBe(30);
    expect(w.current.end).toBe("2024-05-15");
    expect(w.current.start).toBe("2024-04-16");
    expect(w.prior.end).toBe("2024-04-15");
    expect(w.prior.start).toBe("2024-03-17");
  });

  it("resolves '7d' correctly with prior immediately before", () => {
    const w = resolvePeriodWindow({ preset: "7d", now });
    expect(w.current.days).toBe(7);
    expect(w.current.start).toBe("2024-05-09");
    expect(w.current.end).toBe("2024-05-15");
    expect(w.prior.end).toBe("2024-05-08");
    expect(w.prior.start).toBe("2024-05-02");
  });

  it("resolves 'qtd' to start of calendar quarter", () => {
    const w = resolvePeriodWindow({ preset: "qtd", now });
    // May 15 is in Q2 (April-June), so QTD starts at 2024-04-01
    expect(w.current.start).toBe("2024-04-01");
    expect(w.current.end).toBe("2024-05-15");
  });

  it("resolves 'ytd' to Jan 1", () => {
    const w = resolvePeriodWindow({ preset: "ytd", now });
    expect(w.current.start).toBe("2024-01-01");
    expect(w.current.end).toBe("2024-05-15");
  });

  it("resolves a custom range and computes a same-length prior", () => {
    const w = resolvePeriodWindow({
      preset: "custom",
      now,
      dateFromAd: "2024-05-01",
      dateToAd: "2024-05-10",
    });
    expect(w.current.days).toBe(10);
    expect(w.current.start).toBe("2024-05-01");
    expect(w.current.end).toBe("2024-05-10");
    expect(w.prior.end).toBe("2024-04-30");
    expect(w.prior.start).toBe("2024-04-21");
    expect(w.prior.days).toBe(10);
  });
});

describe("computeHospitalDashboard period-over-period", () => {
  const now = new Date("2024-05-15T12:00:00Z");
  const medMap = new Map<string, string>([
    ["amoxicillin", "Antibiotic"],
    ["meloxicam", "NSAID"],
  ]);

  function caseAt(
    id: number,
    dateAd: string,
    extras: Partial<Case> = {},
  ): Case {
    return {
      id,
      caseNumber: `CASE-${String(id).padStart(3, "0")}`,
      billNumber: null,
      dailyNumber: null,
      monthlyNumber: null,
      yearlyNumber: null,
      date: dateAd,
      dateAd,
      ownerName: `Owner ${id}`,
      ownerAddress: "Kathmandu",
      ownerPhone: `980000${String(id).padStart(4, "0")}`,
      species: "Dog",
      breed: "Mixed",
      animalName: `Pet${id}`,
      age: "3",
      sex: "Male",
      sampleType: null,
      sampleDate: null,
      sampleDateAd: null,
      cultureResult: null,
      astResults: null,
      remarks: null,
      registeredBy: 1,
      createdAt: `${dateAd}T10:00:00.000Z`,
      lastUpdatedBy: null,
      lastUpdatedByName: null,
      updatedAt: null,
      customFields: JSON.stringify({
        chiefComplaint: "vomiting",
        diagnosis: "gastritis",
        temperature: "38.5",
      }),
      treatmentDetails: JSON.stringify({
        q1: { medications: [{ medication: "Amoxicillin", route: "PO" }] },
      }),
      veterinarianId: null,
      veterinarianName: "Dr Sharma",
      veterinarianNvc: null,
      veterinarianDepartment: "Small Animal",
      ...extras,
    } as Case;
  }

  it("computes KPI deltas vs prior period and sparkline length", () => {
    const period = resolvePeriodWindow({ preset: "7d", now });
    // 5 cases in the current week, 2 in the prior week
    const cases: Case[] = [
      caseAt(1, "2024-05-09"),
      caseAt(2, "2024-05-10"),
      caseAt(3, "2024-05-11"),
      caseAt(4, "2024-05-12"),
      caseAt(5, "2024-05-15"),
      caseAt(101, "2024-05-04"),
      caseAt(102, "2024-05-08"),
    ];
    const out = computeHospitalDashboard({
      cases,
      groupBy: "day",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
      period,
      casesIncludePrior: true,
    });
    expect(out.overview.totalCases).toBe(5);
    const casesKpi = out.kpis.find((k) => k.id === "cases")!;
    expect(casesKpi.value).toBe(5);
    expect(casesKpi.prior).toBe(2);
    expect(casesKpi.deltaAbs).toBe(3);
    expect(casesKpi.deltaPct).toBeGreaterThan(0);
    expect(casesKpi.sparkline).toHaveLength(7);
    expect(casesKpi.sparkline.reduce((a, b) => a + b, 0)).toBe(5);
  });

  it("does NOT emit vital-threshold alerts (deliberately — no species-specific ranges are defined)", () => {
    const period = resolvePeriodWindow({ preset: "7d", now });
    const out = computeHospitalDashboard({
      cases: [
        caseAt(1, "2024-05-10", {
          customFields: JSON.stringify({
            chiefComplaint: "fever",
            diagnosis: "infection",
            temperature: "40.6",
            heartRate: "210",
            dehydrationPercentage: "12",
          }),
        }),
      ],
      groupBy: "day",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
      period,
      casesIncludePrior: true,
    });
    // Payload no longer exposes a clinicalAlerts field at all.
    expect((out as Record<string, unknown>).clinicalAlerts).toBeUndefined();
    // No vital-threshold based insights are emitted.
    expect(out.insights.some((i) => i.id === "high-temp")).toBe(false);
    expect(out.insights.some((i) => i.id === "severe-dehydration")).toBe(false);
    expect(out.insights.some((i) => i.id === "tachycardia-cluster")).toBe(false);
    // The vital_alerts secondary KPI is gone.
    expect(out.secondaryKpis.some((k) => k.id === "vital_alerts")).toBe(false);
  });

  it("exposes 'Owners served' (not 'Active patients') + 'Tests / case' as KPIs", () => {
    const period = resolvePeriodWindow({ preset: "7d", now });
    const out = computeHospitalDashboard({
      cases: [
        caseAt(1, "2024-05-10", {
          ownerPhone: "9800001111",
          customFields: JSON.stringify({
            chiefComplaint: "vomit",
            diagnosis: "gastritis",
            testsSuggested: ["CBC", "Biochemistry"],
            xrayDetails: "Lateral abdomen",
          }),
        }),
        caseAt(2, "2024-05-11", {
          ownerPhone: "9800001111", // same owner — only 1 distinct
          customFields: JSON.stringify({
            chiefComplaint: "vomit",
            diagnosis: "gastritis",
          }),
        }),
        caseAt(3, "2024-05-12", { ownerPhone: "9800002222" }),
      ],
      groupBy: "day",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
      period,
      casesIncludePrior: true,
    });
    const kpiIds = out.kpis.map((k) => k.id);
    expect(kpiIds).toContain("owners");
    expect(kpiIds).not.toContain("patients");
    const owners = out.kpis.find((k) => k.id === "owners")!;
    expect(owners.value).toBe(2); // 2 distinct phones
    const secondaryIds = out.secondaryKpis.map((k) => k.id);
    expect(secondaryIds).toContain("tests_per_case");
    expect(secondaryIds).not.toContain("vital_alerts");
    const tpc = out.secondaryKpis.find((k) => k.id === "tests_per_case")!;
    // CASE-001 had 3 test items (2 in testsSuggested + xrayDetails), the others 0
    // → avg = 3 / 3 = 1.00
    expect(tpc.value).toBeCloseTo(1, 2);
  });

  it("computes data quality completeness percentages", () => {
    const period = resolvePeriodWindow({ preset: "7d", now });
    const cases: Case[] = [
      caseAt(1, "2024-05-10"),
      caseAt(2, "2024-05-11", {
        customFields: JSON.stringify({ chiefComplaint: "limping" }),
      }),
      caseAt(3, "2024-05-12", {
        customFields: null,
      }),
    ];
    const out = computeHospitalDashboard({
      cases,
      groupBy: "day",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
      period,
      casesIncludePrior: true,
    });
    expect(out.dataQuality.totalCases).toBe(3);
    expect(out.dataQuality.withDiagnosisPct).toBeCloseTo(33.3, 1);
    expect(out.dataQuality.withChiefComplaintPct).toBeCloseTo(66.7, 1);
    expect(out.dataQuality.withVitalsPct).toBeCloseTo(33.3, 1);
  });

  it("aligns caseload trend rows with the current period length", () => {
    const period = resolvePeriodWindow({ preset: "7d", now });
    const out = computeHospitalDashboard({
      cases: [caseAt(1, "2024-05-10"), caseAt(2, "2024-05-08")],
      groupBy: "day",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
      period,
      casesIncludePrior: true,
    });
    expect(out.caseloadTrend.rows).toHaveLength(7);
    // current window May 09..May 15, daily idx 0=May 09, idx 1=May 10
    expect(out.caseloadTrend.rows[0].current).toBe(0); // May 09 — no case
    expect(out.caseloadTrend.rows[1].current).toBe(1); // May 10 — caseAt(1)
    // prior window May 02..May 08, daily idx 0=May 02, idx 6=May 08
    expect(out.caseloadTrend.rows[0].prior).toBe(0); // May 02 — no case
    expect(out.caseloadTrend.rows[6].prior).toBe(1); // May 08 — caseAt(2)
    expect(out.caseloadTrend.rows.some((r) => r.prior === 1)).toBe(true);
  });

  it("emits a narrative summary describing the period", () => {
    const period = resolvePeriodWindow({ preset: "7d", now });
    const out = computeHospitalDashboard({
      cases: [
        caseAt(1, "2024-05-10"),
        caseAt(2, "2024-05-11"),
        caseAt(3, "2024-05-12"),
        caseAt(4, "2024-05-13"),
        caseAt(5, "2024-05-14"),
        caseAt(101, "2024-05-04"),
      ],
      groupBy: "day",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
      period,
      casesIncludePrior: true,
    });
    expect(out.narrative.length).toBeGreaterThan(0);
    // Lead sentence should mention case count and the delta
    expect(out.narrative[0]).toMatch(/case/i);
    expect(out.narrative[0]).toMatch(/up 4/i);
  });

  it("builds vet + department scorecards with hospital average baseline", () => {
    const period = resolvePeriodWindow({ preset: "7d", now });
    const out = computeHospitalDashboard({
      cases: [
        // Dr Sharma / Small Animal — 3 cases, all with Amoxicillin (antibiotic)
        caseAt(1, "2024-05-10", {
          veterinarianName: "Dr Sharma",
          veterinarianDepartment: "Small Animal",
        }),
        caseAt(2, "2024-05-11", {
          veterinarianName: "Dr Sharma",
          veterinarianDepartment: "Small Animal",
        }),
        caseAt(3, "2024-05-12", {
          veterinarianName: "Dr Sharma",
          veterinarianDepartment: "Small Animal",
        }),
        // Dr Karki / Equine — 1 case with Meloxicam (non-antibiotic)
        caseAt(4, "2024-05-13", {
          veterinarianName: "Dr Karki",
          veterinarianDepartment: "Equine",
          treatmentDetails: JSON.stringify({
            q1: { medications: [{ medication: "Meloxicam", route: "SC" }] },
          }),
        }),
      ],
      groupBy: "day",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
      period,
      casesIncludePrior: true,
    });
    // Hospital average antibiotic share = 3 abx / 4 rx total = 75%
    expect(out.scorecards.hospitalAverage.antibioticShare).toBe(75);
    expect(out.scorecards.hospitalAverage.diagnosisRecordedPct).toBe(100);

    const sharma = out.scorecards.vets.find((v) => v.name === "Dr Sharma");
    expect(sharma).toBeDefined();
    expect(sharma!.caseCount).toBe(3);
    expect(sharma!.caseSharePct).toBe(75);
    expect(sharma!.antibioticShare).toBe(100); // every Rx was antibiotic
    expect(sharma!.medsPerCase).toBe(1);
    expect(sharma!.topDiagnosis?.name).toBe("Gastritis");

    const karki = out.scorecards.vets.find((v) => v.name === "Dr Karki");
    expect(karki).toBeDefined();
    expect(karki!.antibioticShare).toBe(0); // Meloxicam is NSAID

    // Departments
    const smallAnimal = out.scorecards.departments.find(
      (d) => d.name === "Small Animal",
    );
    expect(smallAnimal?.caseCount).toBe(3);
    expect(smallAnimal?.antibioticShare).toBe(100);
  });

  it("computes antibiotic share trend with correct percentages", () => {
    const period = resolvePeriodWindow({ preset: "7d", now });
    const cases: Case[] = [
      caseAt(1, "2024-05-10", {
        treatmentDetails: JSON.stringify({
          q1: {
            medications: [
              { medication: "Amoxicillin", route: "PO" }, // Antibiotic
              { medication: "Meloxicam", route: "SC" }, // NSAID
            ],
          },
        }),
      }),
    ];
    const out = computeHospitalDashboard({
      cases,
      groupBy: "day",
      medicationClassByName: medMap,
      filters: { department: "all", vet: "all", medicationClass: "all", avianOnly: false },
      now,
      period,
      casesIncludePrior: true,
    });
    // On May 10 there are 2 rx, 1 of which is antibiotic → 50% share
    const row = out.antibioticTrend.rows.find((r) => r.totalRx === 2);
    expect(row?.sharePct).toBe(50);
    expect(out.antibioticTrend.currentAvgSharePct).toBe(50);
  });
});
