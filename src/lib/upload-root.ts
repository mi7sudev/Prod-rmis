// ============================================================================
// RMIS — Upload storage root resolution (Task 73).
//
// INCIDENT (Oct 2026): both v4.2 and v4.3 resolved uploads against
// `path.join(process.cwd(), "upload")`. Production runs
// `node .next/standalone/server.js`, and Next.js's standalone entrypoint does
// `process.chdir(__dirname)` — so process.cwd() is `.../.next/standalone`, a
// directory that `next build` REPLACES on every deployment. Applicant files
// were wiped by each rebuild while their Document rows survived in the
// persistent SQLite db: the review queue showed file metadata
// ("Resume-…-C.pdf · SUPPORTING · 95 KB") but every PDF/image view 404'd —
// 66 of 70 document files were gone; only the 4 uploaded since the last
// rebuild survived. The `UPLOAD_DIR` line that production .env files have
// carried since v4.1 was never read by any previous version (dead config).
//
// WRITER root (where NEW files are stored) — first match wins:
//   1. UPLOAD_DIR env — the runbook pins it to <deployRoot>/upload (the
//      persistent sibling of .next/ and db/, exactly like DATABASE_URL).
//   2. Standalone runtime detected (cwd inside .next/standalone)
//      → <deployRoot>/upload.
//   3. Fallback: <cwd>/upload — unchanged dev / `next start` behavior.
//
// READERS additionally probe LEGACY roots so files written by previous builds
// (still sitting inside .next/standalone/upload until an operator rescues
// them) keep resolving after a rebuild. `resolveStoredFile` returns the first
// candidate that exists on disk; `removeStoredFile` deletes the file from
// every candidate. Deliberately framework-free (plain node:fs/path) so route
// handlers and ops scripts share one implementation.
// ============================================================================

import fs from "fs";
import path from "path";

/** Matches a cwd that the standalone entrypoint chdir'd into. */
const STANDALONE_RE = /(^|[\\/])\.next[\\/]standalone([\\/]|$)/;

/** The auto-detected root for the current runtime shape (ignores env). */
function autoUploadRoot(): string {
  const cwd = process.cwd();
  if (STANDALONE_RE.test(cwd)) return path.resolve(cwd, "..", "..", "upload");
  return path.join(cwd, "upload");
}

/** Absolute directory where NEW uploads are written. */
export function getUploadRoot(): string {
  const envDir = process.env.UPLOAD_DIR?.trim();
  if (envDir) return path.resolve(envDir);
  return autoUploadRoot();
}

/** Every root a reader may probe: writer root first, then legacy locations. */
export function uploadRootCandidates(): string[] {
  const roots: string[] = [];
  const push = (p: string) => {
    if (p && !roots.includes(p)) roots.push(p);
  };
  push(getUploadRoot());
  const cwd = process.cwd();
  // UPLOAD_DIR set but different from the auto root → probe the auto root too.
  if (process.env.UPLOAD_DIR?.trim()) push(autoUploadRoot());
  // Files written before Task 73 live inside the standalone copy.
  if (STANDALONE_RE.test(cwd)) push(path.join(cwd, "upload"));
  return roots;
}

/** doc.filePath is stored as "upload/<applicantId>/<file>" — normalize to
    "<applicantId>/<file>" and refuse anything that could escape a root. */
function relativeSegments(filePath: string): string[] | null {
  const segs = filePath.split(/[\\/]/).filter(Boolean);
  if (segs[0] === "upload") segs.shift();
  if (segs.length < 2 || segs.includes("..")) return null;
  return segs;
}

function contained(root: string, abs: string): boolean {
  return abs.startsWith(path.resolve(root) + path.sep);
}

/** First existing file across the candidate roots, or null when the stored
    file is missing everywhere (incident mode: row exists, bytes are gone). */
export function resolveStoredFile(filePath: string): string | null {
  const segs = relativeSegments(filePath);
  if (!segs) return null;
  for (const root of uploadRootCandidates()) {
    const abs = path.resolve(root, ...segs);
    if (!contained(root, abs)) continue;
    try {
      if (fs.statSync(abs).isFile()) return abs;
    } catch {
      // not at this root — try the next candidate
    }
  }
  return null;
}

/** Delete every on-disk copy across the candidate roots (best-effort). Used
    by the delete route and the profile-picture replace cleanup. */
export function removeStoredFile(filePath: string): void {
  const segs = relativeSegments(filePath);
  if (!segs) return;
  for (const root of uploadRootCandidates()) {
    const abs = path.resolve(root, ...segs);
    if (!contained(root, abs)) continue;
    try {
      fs.rmSync(abs, { force: true });
    } catch {
      // best-effort file removal
    }
  }
}
