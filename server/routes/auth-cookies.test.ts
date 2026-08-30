import { describe, expect, it, vi, afterEach } from "vitest";
import type { Request } from "express";
import { isAllowedAuthOrigin, shouldIncludeSessionTokenInBody } from "./auth-cookies";

function reqWith(headers: Record<string, string>): Request {
  return { headers } as Request;
}

describe("auth-cookies security helpers", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("isAllowedAuthOrigin allows matching origin in production", () => {
    process.env.NODE_ENV = "production";
    expect(
      isAllowedAuthOrigin(
        reqWith({ origin: "https://vth.deeps.com.np", host: "vth.deeps.com.np" }),
      ),
    ).toBe(true);
  });

  it("isAllowedAuthOrigin rejects cross-origin in production", () => {
    process.env.NODE_ENV = "production";
    expect(
      isAllowedAuthOrigin(
        reqWith({ origin: "https://evil.example", host: "vth.deeps.com.np" }),
      ),
    ).toBe(false);
  });

  it("shouldIncludeSessionTokenInBody is false in production", () => {
    process.env.NODE_ENV = "production";
    expect(shouldIncludeSessionTokenInBody()).toBe(false);
    process.env.NODE_ENV = "test";
    expect(shouldIncludeSessionTokenInBody()).toBe(true);
  });
});
