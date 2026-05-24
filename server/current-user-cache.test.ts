import { describe, expect, it, beforeEach } from "vitest";
import type { CurrentUser } from "./routes/types";
import {
  getCachedCurrentUser,
  invalidateAll,
  invalidateToken,
  invalidateUserId,
  rememberCurrentUser,
} from "./current-user-cache";

const user = (id: number, role = "admin"): CurrentUser => ({
  id,
  role,
  approved: true,
  designation: "Test",
});

beforeEach(() => {
  invalidateAll();
});

describe("current-user-cache", () => {
  it("returns the cached snapshot by token", () => {
    rememberCurrentUser("tok-1", user(1));
    expect(getCachedCurrentUser("tok-1")?.id).toBe(1);
  });

  it("returns undefined for an unknown token", () => {
    expect(getCachedCurrentUser("nope")).toBeUndefined();
  });

  it("invalidates a single token", () => {
    rememberCurrentUser("tok-2", user(2));
    invalidateToken("tok-2");
    expect(getCachedCurrentUser("tok-2")).toBeUndefined();
  });

  it("invalidates every token for a user", () => {
    rememberCurrentUser("tok-a", user(3));
    rememberCurrentUser("tok-b", user(3));
    rememberCurrentUser("tok-c", user(4));
    invalidateUserId(3);
    expect(getCachedCurrentUser("tok-a")).toBeUndefined();
    expect(getCachedCurrentUser("tok-b")).toBeUndefined();
    expect(getCachedCurrentUser("tok-c")?.id).toBe(4);
  });

  it("invalidateAll wipes the cache", () => {
    rememberCurrentUser("tok-x", user(5));
    rememberCurrentUser("tok-y", user(6));
    invalidateAll();
    expect(getCachedCurrentUser("tok-x")).toBeUndefined();
    expect(getCachedCurrentUser("tok-y")).toBeUndefined();
  });
});
