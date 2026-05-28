import { describe, expect, it } from "vitest";
import {
  getPasswordPolicyChecks,
  isPasswordPolicyMet,
  validateStrongPassword,
} from "./schema";

describe("password policy", () => {
  it("accepts 8+ chars with letter and digit", () => {
    expect(validateStrongPassword("Secret12")).toBeNull();
    expect(isPasswordPolicyMet("Secret12")).toBe(true);
  });

  it("rejects short passwords", () => {
    expect(validateStrongPassword("Sec1")).toMatch(/at least 8/);
    expect(isPasswordPolicyMet("Sec1")).toBe(false);
  });

  it("rejects passwords without a letter", () => {
    expect(validateStrongPassword("12345678")).toMatch(/letter/);
    const checks = getPasswordPolicyChecks("12345678");
    expect(checks.find((c) => c.id === "hasLetter")?.passed).toBe(false);
  });

  it("rejects passwords without a digit", () => {
    expect(validateStrongPassword("SecretOnly")).toMatch(/number/);
    const checks = getPasswordPolicyChecks("SecretOnly");
    expect(checks.find((c) => c.id === "hasDigit")?.passed).toBe(false);
  });
});
