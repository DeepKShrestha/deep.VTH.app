import { describe, expect, it } from "vitest";
import {
  CASE_ATTACHMENT_MAX_INPUT_BYTES,
  CASE_ATTACHMENT_MAX_STORED_BYTES,
  isAllowedCaseAttachmentImage,
  isAllowedProfilePhotoImage,
} from "./compress-case-attachment-image";

describe("isAllowedCaseAttachmentImage", () => {
  it("accepts jpg/png with matching extension", () => {
    expect(
      isAllowedCaseAttachmentImage(
        new File([], "photo.jpg", { type: "image/jpeg" }),
      ),
    ).toBe(true);
    expect(
      isAllowedCaseAttachmentImage(
        new File([], "scan.png", { type: "image/png" }),
      ),
    ).toBe(true);
  });

  it("rejects unsupported types", () => {
    expect(
      isAllowedCaseAttachmentImage(
        new File([], "doc.pdf", { type: "application/pdf" }),
      ),
    ).toBe(false);
  });
});

describe("isAllowedProfilePhotoImage", () => {
  it("accepts webp", () => {
    expect(
      isAllowedProfilePhotoImage(
        new File([], "id.webp", { type: "image/webp" }),
      ),
    ).toBe(true);
  });
});

describe("attachment size limits", () => {
  it("allows 5MB input and 1MB stored caps", () => {
    expect(CASE_ATTACHMENT_MAX_INPUT_BYTES).toBe(5 * 1024 * 1024);
    expect(CASE_ATTACHMENT_MAX_STORED_BYTES).toBe(1024 * 1024);
  });
});
