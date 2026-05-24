import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db-query", () => ({
  dbRun: vi.fn(),
}));

import { dbRun } from "./db-query";
import { pruneSessionsOnBoot } from "./session-boot-prune";

describe("pruneSessionsOnBoot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dbRun).mockResolvedValue(undefined);
    delete process.env.WIPE_SESSIONS_ON_BOOT;
  });

  afterEach(() => {
    delete process.env.WIPE_SESSIONS_ON_BOOT;
  });

  it("deletes only expired sessions by default", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await pruneSessionsOnBoot();
    expect(warn).not.toHaveBeenCalled();
    expect(dbRun).toHaveBeenCalledTimes(1);
  });

  it("wipes all sessions and logs when WIPE_SESSIONS_ON_BOOT=true", async () => {
    process.env.WIPE_SESSIONS_ON_BOOT = "true";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await pruneSessionsOnBoot();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/WIPE_SESSIONS_ON_BOOT=true/),
    );
    expect(dbRun).toHaveBeenCalledTimes(1);
  });
});
