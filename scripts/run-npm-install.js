#!/usr/bin/env node
/**
 * run-npm-install.js — resilient npm install
 *
 * The plain `npm install` used to hang forever when a TLS connection to the
 * registry stalled mid-response (npm has no timeout for an in-flight response
 * that stops delivering data). This wrapper bounds each attempt with a hard
 * timeout, retries with backoff, and passes --prefer-offline so unchanged
 * deps resolve from cache instead of the network.
 *
 * Usage: node scripts/run-npm-install.js [dir] [extra npm args...]
 *   dir omitted → cwd (or repo root when invoked from repo-root scripts)
 *
 * Exit code: 0 on success, 1 after all attempts fail.
 */

const { spawnSync } = require("child_process");
const path = require("path");

const [, , dirArg, ...npmArgs] = process.argv;
const maxAttempts = parseInt(process.env.NPM_INSTALL_MAX_ATTEMPTS || "3", 10);
const attemptMs = parseInt(process.env.NPM_INSTALL_ATTEMPT_MS || "120000", 10);
const backoffMs = parseInt(process.env.NPM_INSTALL_BACKOFF_MS || "3000", 10);

// When a dir is passed explicitly (version.js build step) resolve it against
// the repo root; otherwise install in the caller's current directory (the
// package.json scripts `cd` into the subpackage first).
const repoRoot = path.resolve(__dirname, "..");
const dir = dirArg ? path.resolve(repoRoot, dirArg) : process.cwd();

function attempt(n) {
  console.log(`> npm install (attempt ${n}/${maxAttempts}) in ${dir}`);
  // shell: true is required on Windows — npm is installed there as an
  // `npm.cmd` shim, and spawnSync without a shell cannot resolve .cmd
  // executables (it fails with no status/signal, surfacing as
  // "exit code unknown"). On Unix the shell resolves the bare `npm` path
  // as before.
  const r = spawnSync(
    "npm",
    ["install", "--prefer-offline", "--no-audit", "--no-fund", ...npmArgs],
    { cwd: dir, stdio: "inherit", timeout: attemptMs, shell: true },
  );
  if (r.status === 0) {
    return true;
  }
  const reason =
    r.signal === "SIGTERM" || r.error && r.error.code === "ETIMEDOUT"
      ? "timed out (likely a stalled registry connection)"
      : `exit code ${r.status ?? "unknown"}`;
  console.error(`❌ npm install ${reason} — ${n < maxAttempts ? "retrying in " + backoffMs / 1000 + "s" : "giving up."}`);
  return false;
}

for (let n = 1; n <= maxAttempts; n++) {
  if (attempt(n)) {
    process.exit(0);
  }
  if (n < maxAttempts) {
    spawnSync("sleep", [String(backoffMs / 1000)], { stdio: "inherit" });
  }
}
process.exit(1);
