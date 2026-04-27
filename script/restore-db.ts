import { copyFile } from "fs/promises";
import path from "path";

async function run() {
  const source = process.env.DB_RESTORE_FROM;
  if (!source) {
    throw new Error("DB_RESTORE_FROM is required");
  }

  const sourceFile = path.resolve(process.cwd(), source);
  const targetFile = path.resolve(process.cwd(), process.env.DB_FILE || "data.db");

  await copyFile(sourceFile, targetFile);
  console.log(`Database restored from ${sourceFile} -> ${targetFile}`);
}

run().catch((error) => {
  console.error("Restore failed:", error);
  process.exit(1);
});
