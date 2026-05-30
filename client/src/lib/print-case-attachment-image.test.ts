import { describe, expect, it, vi } from "vitest";
import { formatCaseDateForAttachmentPrint } from "./print-case-attachment-image";

vi.mock("@/lib/nepali-date", () => ({
  formatBsDate: (bs: string) => `BS:${bs}`,
  formatAdDate: (ad: string) => `AD:${ad}`,
}));

describe("formatCaseDateForAttachmentPrint", () => {
  it("formats BS with optional AD", () => {
    expect(formatCaseDateForAttachmentPrint("2081-05-01", "2024-08-17")).toBe(
      "BS:2081-05-01 (AD:2024-08-17)",
    );
  });

  it("formats BS only when AD missing", () => {
    expect(formatCaseDateForAttachmentPrint("2081-05-01", null)).toBe("BS:2081-05-01");
  });
});
