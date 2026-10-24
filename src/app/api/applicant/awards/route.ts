// ============================================================================
// RMIS — Awards section CRUD (spec §6.3, §5.3). APPLICANT-only.
// dateGranted stays TEXT. GET = own rows ordered ord asc.
// No PUT (edit = delete + recreate).
// ============================================================================

import { ok, handleApi, requireEntryContent } from "@/lib/api";
import { requireApplicantProfileAccess } from "@/lib/role-policy";
import { db } from "@/lib/db";
import { awardSchema, orNull } from "@/lib/validation";


export const GET = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantProfileAccess(req, "applicant/awards", "GET");
  const rows = await db.award.findMany({ where: { applicantId: applicant.id }, orderBy: { ord: "asc" } });
  return ok(rows);
});

export const POST = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantProfileAccess(req, "applicant/awards", "POST");
  const body = awardSchema.parse(await req.json().catch(() => ({})));

  // Blank rows never become rows (they used to satisfy the apply gate).
  requireEntryContent("award entry", {
    recognitionType: orNull(body.recognitionType),
    scope: orNull(body.scope),
    details: orNull(body.details),
    category: orNull(body.category),
    provider: orNull(body.provider),
    dateGranted: orNull(body.dateGranted),
    points: body.points ?? null,
  });

  const row = await db.award.create({
    data: {
      applicantId: applicant.id,
      recognitionType: orNull(body.recognitionType),
      scope: orNull(body.scope),
      details: orNull(body.details),
      category: orNull(body.category),
      provider: orNull(body.provider),
      dateGranted: orNull(body.dateGranted),
      points: body.points ?? null,
      hrRemarks: orNull(body.hrRemarks),
      ord: Date.now(),
    },
  });

  return ok(row, 201);
});
