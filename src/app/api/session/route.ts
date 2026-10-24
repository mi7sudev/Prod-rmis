// ============================================================================
// RMIS — GET /api/session (public bootstrap, spec §3.2)
// { user: null } for: no session; staff session resolved from a non-intranet
// network (fail closed + audited); deleted/blocked users (guard fails closed).
// Otherwise the full session user incl. the applicant apply-gate flag
// (isProfileComplete — also feeds the Home profile ring).
// ============================================================================

import { db } from "@/lib/db";
import { handleApi, ok, getClientIp } from "@/lib/api";
import { getSessionFromReq, isIntranetRequest } from "@/lib/auth";
import { auditLog, userLabelOf } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = handleApi(async (req: Request) => {
  const user = await getSessionFromReq(req);
  if (!user) return ok({ user: null });

  // Chokepoint 2 of 3 — staff session from a public network resolves to null.
  if ((user.role === "ADMIN" || user.role === "EVALUATOR") && !isIntranetRequest(req)) {
    auditLog({
      userId: user.id,
      userLabel: userLabelOf(user),
      userRole: user.role,
      action: "STAFF_ACCESS_BLOCKED_EXTERNAL",
      entityType: "user",
      entityId: user.id,
      description: "Staff session blocked from a non-intranet network",
      ipAddress: getClientIp(req),
    });
    return ok({ user: null });
  }

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: {
      middleName: true,
      blocked: true,
      applicant: { select: { id: true, isProfileComplete: true } },
    },
  });

  // Task 63 — the session still carries isProfileComplete (the apply gate in
  // apply-dialogs and the Home profile ring read it), but the former
  // requirementsMet computation (validateProfileCompletion per session
  // fetch) retired with the Task 15 navigation gate — one less DB probe on
  // every session load.
  let applicant: { id: number; isProfileComplete: boolean } | null = null;
  if (row?.applicant) {
    applicant = {
      id: row.applicant.id,
      isProfileComplete: row.applicant.isProfileComplete,
    };
  }

  return ok({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      middleName: row?.middleName ?? null,
      isActive: !row?.blocked,
      applicant,
    },
  });
});
