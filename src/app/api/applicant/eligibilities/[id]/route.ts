// ============================================================================
// RMIS — Eligibility delete (spec §6.3). Ownership enforced: the row's
// applicantId must match the caller's, otherwise 404.
// ============================================================================

import { ok, handleApi, ApiError, parseId } from "@/lib/api";
import { requireApplicantProfileAccess } from "@/lib/role-policy";
import { db } from "@/lib/db";

export const DELETE = handleApi(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { applicant } = await requireApplicantProfileAccess(req, "applicant/eligibilities/[id]", "DELETE");
  const { id } = await params;

  const row = await db.eligibility.findUnique({ where: { id: parseId(id) } });
  if (!row || row.applicantId !== applicant.id) throw new ApiError("Not found", 404);

  await db.eligibility.delete({ where: { id: row.id } });
  return ok({ id: row.id, deleted: true });
});
