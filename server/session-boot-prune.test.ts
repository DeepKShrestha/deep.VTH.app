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

  it("wipes ALL sessions by default (restart = logout for everyone)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await pruneSessionsOnBoot();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Wiping all sessions on boot/),
    );
    expect(dbRun).toHaveBeenCalledTimes(1);
  });

  it("keeps active sessions when WIPE_SESSIONS_ON_BOOT=false (opt-out)", async () => {
    process.env.WIPE_SESSIONS_ON_BOOT = "false";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await pruneSessionsOnBoot();
    expect(warn).not.toHaveBeenCalled();
    expect(dbRun).toHaveBeenCalledTimes(1);
  });

  it("wipes when WIPE_SESSIONS_ON_BOOT is set to any value other than 'false'", async () => {
    process.env.WIPE_SESSIONS_ON_BOOT = "true";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await pruneSessionsOnBoot();
    expect(warn).toHaveBeenCalled();
    expect(dbRun).toHaveBeenCalledTimes(1);
  });
});
