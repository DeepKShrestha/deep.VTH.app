import { mkdir, copyFile } from "fs/promises";
import path from "path";

function timestamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours(),
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function run() {
  const dbFile = path.resolve(process.cwd(), process.env.DB_FILE || "data.db");
  const backupDir = path.resolve(
    process.cwd(),
    process.env.DB_BACKUP_DIR || "backups",
  );
  await mkdir(backupDir, { recursive: true });

  const outFile = path.join(backupDir, `data-${timestamp()}.db`);
  await copyFile(dbFile, outFile);

  console.log(`Backup created: ${outFile}`);
}

run().catch((error) => {
  console.error("Backup failed:", error);
  process.exit(1);
});
