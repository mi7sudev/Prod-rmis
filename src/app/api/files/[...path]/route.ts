// ============================================================================
// RMIS — File serving (spec §6.4, §10). GET /api/files/<applicantId>/<file>.
// A leading "upload" segment is tolerated (doc.filePath form) and stripped.
// Any signed-in user; APPLICANT → own directory only (403 otherwise);
// EVALUATOR/ADMIN → any. `.meta.json` sidecars are never served. Path
// containment guard per root. Inline disposition with the original filename
// (RFC 5987); Cache-Control: private, no-store.
// Task 73 — resolves across the persistent upload root (UPLOAD_DIR / deploy
// root) AND legacy locations, so files that still live inside an old
// .next/standalone/upload keep downloading until an operator rescues them.
// ============================================================================

import { NextResponse } from "next/server";
import { handleApi, ApiError } from "@/lib/api";
import { requireRouteAccess } from "@/lib/role-policy";
import { db } from "@/lib/db";
import { resolveStoredFile } from "@/lib/upload-root";
import fs from "fs";

export const GET = handleApi(async (req: Request, { params }: { params: Promise<{ path: string[] }> }) => {
  const user = await requireRouteAccess(req, "files/[...path]", "GET");

  const { path: segments } = await params;
  if (!segments || segments.length < 2) throw new ApiError("Not found", 404);
  // Accept both /api/files/<id>/<file> and /api/files/upload/<id>/<file>.
  if (segments[0] === "upload") segments.shift();
  if (segments.length < 2) throw new ApiError("Not found", 404);

  const fileName = segments[segments.length - 1];
  if (fileName.endsWith(".meta.json")) throw new ApiError("Not found", 404);

  const applicantId = Number(segments[0]);
  if (!Number.isInteger(applicantId)) throw new ApiError("Not found", 404);
  if (user.role === "APPLICANT" && user.applicantId !== applicantId) {
    throw new ApiError("Forbidden: you may only access your own files", 403);
  }

  // Task 73 + audit 2026-10-22 — ONE resolver for every reader: candidate
  // roots (writer first, legacy after), per-root containment, first existing
  // file wins. The route only adds the .meta.json + ownership rules.
  const resolved = resolveStoredFile(segments.join("/"));
  if (!resolved) throw new ApiError("Not found", 404);

  const doc = await db.document.findFirst({ where: { applicantId, fileName } });
  const contentType = doc?.mimeType || "application/octet-stream";
  const dispositionName = encodeURIComponent(doc?.originalName || fileName);

  const data = fs.readFileSync(resolved);
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename*=UTF-8''${dispositionName}`,
      "Cache-Control": "private, no-store",
    },
  });
});
