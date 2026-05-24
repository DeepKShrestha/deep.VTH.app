import { describe, expect, it } from "vitest";
import type { DownloadRequest } from "@shared/schema";
import {
  describeApprovalWindow,
  evaluateExportRange,
  findActiveApproval,
} from "./export-approval";

function req(
  partial: Partial<DownloadRequest> & { id: number; status: DownloadRequest["status"] },
): DownloadRequest {
  return {
    id: partial.id,
    userId: 1,
    dateFrom: partial.dateFrom ?? null,
    dateTo: partial.dateTo ?? null,
    reason: null,
    status: partial.status,
    resolvedBy: null,
    resolverNote: null,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    resolvedAt: null,
    requestSource: partial.requestSource ?? "ast_report",
  } as DownloadRequest;
}

describe("findActiveApproval", () => {
  it("returns newest approved request for the given source", () => {
    const newer = req({
      id: 2,
      status: "approved",
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    const older = req({
      id: 1,
      status: "approved",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(findActiveApproval([older, newer], "ast_report")?.id).toBe(2);
  });

  it("ignores pending, rejected, downloaded, and mismatched sources", () => {
    const requests = [
      req({ id: 1, status: "pending" }),
      req({ id: 2, status: "rejected" }),
      req({ id: 3, status: "downloaded" }),
      req({ id: 4, status: "approved", requestSource: "hospital_case" }),
    ];
    expect(findActiveApproval(requests, "ast_report")).toBeUndefined();
  });
});

describe("evaluateExportRange", () => {
  it("returns ok when there is no approval", () => {
    expect(evaluateExportRange(undefined, "", "").ok).toBe(true);
  });

  it("returns ok when approval has no bounds", () => {
    expect(
      evaluateExportRange({ dateFrom: null, dateTo: null }, "", "").ok,
    ).toBe(true);
  });

  it("requires explicit dates when approval is bounded", () => {
    const result = evaluateExportRange(
      { dateFrom: "2082-01-01", dateTo: "2082-01-31" },
      "",
      "",
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Pick a date range/i);
  });

  it("rejects start date before the approved window", () => {
    const result = evaluateExportRange(
      { dateFrom: "2082-01-10", dateTo: "2082-01-31" },
      "2082-01-05",
      "2082-01-20",
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/before/i);
  });

  it("rejects end date after the approved window", () => {
    const result = evaluateExportRange(
      { dateFrom: "2082-01-10", dateTo: "2082-01-31" },
      "2082-01-15",
      "2082-02-15",
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/after/i);
  });

  it("accepts a range fully within the approved window", () => {
    const result = evaluateExportRange(
      { dateFrom: "2082-01-10", dateTo: "2082-01-31" },
      "2082-01-12",
      "2082-01-20",
    );
    expect(result.ok).toBe(true);
  });
});

describe("describeApprovalWindow", () => {
  it("describes a bounded window", () => {
    expect(
      describeApprovalWindow({ dateFrom: "2082-01-01", dateTo: "2082-01-31" }),
    ).toBe("2082-01-01 → 2082-01-31");
  });

  it("describes open-start and open-end windows", () => {
    expect(describeApprovalWindow({ dateFrom: "2082-01-01", dateTo: null })).toBe(
      "from 2082-01-01",
    );
    expect(describeApprovalWindow({ dateFrom: null, dateTo: "2082-01-31" })).toBe(
      "until 2082-01-31",
    );
  });

  it("describes an unbounded window", () => {
    expect(describeApprovalWindow({ dateFrom: null, dateTo: null })).toBe("any date");
  });
});
