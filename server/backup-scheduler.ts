import { getBackupSettings } from "./services/backup-settings";
import { runSiteBackup } from "./services/backup-service";

let timer: NodeJS.Timeout | null = null;

function scheduleNext(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void tick();
  }, ms);
  timer.unref?.();
}

async function tick(): Promise<void> {
  try {
    const s = await getBackupSettings();
    const intervalMs = Math.max(s.autoIntervalHours * 3600 * 1000, 3600 * 1000);
    if (s.autoBackupEnabled) {
      await runSiteBackup("scheduled");
    }
    scheduleNext(intervalMs);
  } catch (err: unknown) {
    console.error(
      JSON.stringify({
        type: "scheduled_site_backup_error",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    scheduleNext(3600 * 1000);
  }
}

/** Runs after `auto_interval_hours` (minimum 1h); reads settings each cycle. */
export function scheduleSiteBackupJobs(): void {
  void getBackupSettings().then((s) => {
    const intervalMs = Math.max(s.autoIntervalHours * 3600 * 1000, 3600 * 1000);
    scheduleNext(intervalMs);
  });
}
