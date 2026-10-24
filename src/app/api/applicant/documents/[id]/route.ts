// ============================================================================
// RMIS — Document delete (spec §6.4). Removes the binary + the sidecar row.
// Ownership enforced: the document's applicantId must match the caller's,
// otherwise 404. Audit DOCUMENT_DELETED. → { id, deleted: true }.
// ============================================================================

import { ok, handleApi, ApiError, getClientIp } from "@/lib/api";
import { requireApplicantProfileAccess } from "@/lib/role-policy";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { removeStoredFile } from "@/lib/upload-root";
// Task 73 — binary removal goes through lib/upload-root so it clears the file
// at the persistent root AND any legacy copy (e.g. .next/standalone/upload).

export const DELETE = handleApi(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user, applicant } = await requireApplicantProfileAccess(req, "applicant/documents/[id]", "DELETE");
  const { id } = await params;

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || doc.applicantId !== applicant.id) throw new ApiError("Not found", 404);

  removeStoredFile(doc.filePath);
  await db.document.delete({ where: { id: doc.id } });

  auditLog({
    userId: user.id,
    userLabel: `${user.username} (${user.email})`,
    userRole: user.role,
    action: "DOCUMENT_DELETED",
    entityType: "document",
    entityId: doc.id,
    description: `Deleted ${doc.category} document "${doc.originalName}"`,
    ipAddress: getClientIp(req),
  });

  return ok({ id: doc.id, deleted: true });
});
