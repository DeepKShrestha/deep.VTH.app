/**
 * Runs SQLite native preflight and the app entry under the *same* Node binary
 * (`process.execPath`). That avoids the common Windows/PATH issue where one `node.exe`
 * ran a preflight and `tsx` resolved to another (different ABI → crash after preflight "passed").
 */
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const ensureScript = path.join(__dirname, "ensure-sqlite-binary.cjs");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const serverEntry = path.join(root, "server", "index.ts");

function run(args) {
  const r = spawnSync(process.execPath, args, {
    stdio: "inherit",
    cwd: root,
    env: process.env,
  });
  return r.status === 0 ? 0 : r.status ?? 1;
}

let code = run([ensureScript]);
if (code !== 0) process.exit(code);

if (!require("fs").existsSync(tsxCli)) {
  console.error("[dev-server] tsx CLI not found at:", tsxCli);
  console.error("Run `npm install` from the project root.");
  process.exit(1);
}

code = run([tsxCli, serverEntry]);
process.exit(code);
