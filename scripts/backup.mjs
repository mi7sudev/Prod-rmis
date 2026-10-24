// ============================================================================
// RMIS — Offline backup of the persistent data (Task 73).
//
// DEPLOYMENT.md has documented a nightly `npm run backup` cron since the v4.1
// runbook, but the script itself never shipped — which is how the Oct 2026
// upload-loss incident (uploads inside .next/standalone, wiped by rebuilds)
// went unnoticed. This closes that gap.
//
// What it does:
//   1. Copies the SQLite database (plus -wal/-shm sidecars when present) and
//      the whole upload tree into backups/<timestamp>/.
//   2. Prunes old backup runs, keeping the newest BACKUP_KEEP (default 14).
//
// Usage (honors the same env the runbook sets for PM2):
//   DATABASE_URL="file:$PWD/db/production-data.db" UPLOAD_DIR="$PWD/upload" \
//     npm run backup
//   BACKUP_KEEP=30 npm run backup        # keep more runs
//
// Framework-free node (no deps) so it runs anywhere the app runs.
// ============================================================================

import fs from "fs";
import path from "path";

const cwd = process.cwd();
const STANDALONE_RE = /(^|[\\/])\.next[\\/]standalone([\\/]|$)/;

// Mirrors src/lib/upload-root.ts resolution (duplicated on purpose: this file
// must stay runnable with plain `node scripts/backup.mjs`, no TS toolchain).
const uploadDir = process.env.UPLOAD_DIR?.trim()
  ? path.resolve(process.env.UPLOAD_DIR.trim())
  : STANDALONE_RE.test(cwd)
    ? path.resolve(cwd, "..", "..", "upload")
    : path.join(cwd, "upload");

const dbUrl = process.env.DATABASE_URL?.trim() || "";
const dbFile = dbUrl.startsWith("file:")
  ? path.resolve(dbUrl.slice(5).trim())
  : path.join(cwd, "db", "production-data.db");

const backupRoot = path.join(cwd, "backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dest = path.join(backupRoot, stamp);

fs.mkdirSync(dest, { recursive: true });

// 1) Database (+ WAL/SHM sidecars — copying them together keeps the snapshot
//    consistent for SQLite's recovery logic if a -wal file was mid-flight).
const dbCopies = [];
for (const suffix of ["", "-wal", "-shm"]) {
  const src = dbFile + suffix;
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(dest, path.basename(src)));
    dbCopies.push(path.basename(src));
  }
}

// 2) Upload tree (applicant documents, profile pictures).
let uploadFiles = 0;
if (fs.existsSync(uploadDir)) {
  fs.cpSync(uploadDir, path.join(dest, "upload"), { recursive: true });
  const count = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => {
      const p = path.join(dir, e.name);
      return n + (e.isDirectory() ? count(p) : 1);
    }, 0);
  uploadFiles = count(path.join(dest, "upload"));
}

// 3) Prune old runs (keep newest BACKUP_KEEP).
const keep = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);
const runs = fs
  .readdirSync(backupRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();
for (const stale of runs.slice(0, Math.max(0, runs.length - keep))) {
  fs.rmSync(path.join(backupRoot, stale), { recursive: true, force: true });
}

const keptNote = runs.length > keep ? ` (pruned ${runs.length - keep} old run${runs.length - keep === 1 ? "" : "s"})` : "";
console.log(
  `[backup] ${dest}\n` +
    `[backup] db: ${dbCopies.length ? dbCopies.join(", ") : "MISSING — check DATABASE_URL"}\n` +
    `[backup] uploads: ${uploadFiles} file${uploadFiles === 1 ? "" : "s"} from ${uploadDir}${keptNote}`
);
if (!dbCopies.length) process.exitCode = 1;
