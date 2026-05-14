/**
 * Preflight for native `better-sqlite3` (runs after `npm install`, before `npm run build`, etc.).
 *
 * `require("better-sqlite3")` alone does not load the native `.node` binding; we open an
 * in-memory database and close it so ABI mismatches are always detected before the app starts.
 *
 * Rebuilds when that probe fails with a clear Node ABI mismatch message. We do not treat
 * bare `ERR_DLOPEN_FAILED` as ABI (Windows often uses it for "DLL locked" / antivirus).
 */
"use strict";

const { spawnSync } = require("child_process");

const MODULE_NAME = "better-sqlite3";

function probe() {
  try {
    const Database = require(MODULE_NAME);
    const d = new Database(":memory:");
    d.close();
    return { ok: true };
  } catch (err) {
    const code = err && err.code;
    const msg = err && err.message ? String(err.message) : "";
    const isFileLock =
      /EBUSY|resource busy or locked|EPERM|being used by another process/i.test(msg);
    const isAbiMismatch =
      !isFileLock &&
      (/NODE_MODULE_VERSION/.test(msg) ||
        /was compiled against a different Node\.js version/i.test(msg));
    return { ok: false, isAbiMismatch, err };
  }
}

function rebuild() {
  const result = spawnSync("npm", ["rebuild", MODULE_NAME], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

function main() {
  const first = probe();
  if (first.ok) {
    return;
  }

  if (!first.isAbiMismatch) {
    console.error(`[ensure-sqlite-binary] ${MODULE_NAME} failed to load (non-ABI error):`);
    console.error(first.err);
    process.exit(1);
  }

  const nodeVersion = process.versions.node;
  const abi = process.versions.modules;
  console.log(
    `[ensure-sqlite-binary] ${MODULE_NAME} binary does not match this Node (Node ${nodeVersion}, ABI ${abi}). Rebuilding…`,
  );

  if (!rebuild()) {
    console.error(`[ensure-sqlite-binary] \`npm rebuild ${MODULE_NAME}\` failed.`);
    console.error(
      "If you see EBUSY/EPERM on Windows, stop other Node processes (dev server, tests, IDE) and retry.",
    );
    console.error(
      "Otherwise install a C++ toolchain (e.g. Visual Studio Build Tools) and Python.",
    );
    process.exit(1);
  }

  const after = probe();
  if (!after.ok) {
    console.error(
      `[ensure-sqlite-binary] ${MODULE_NAME} still does not load after rebuild:`,
    );
    console.error(after.err);
    process.exit(1);
  }

  console.log(`[ensure-sqlite-binary] ${MODULE_NAME} rebuilt successfully.`);
}

main();
