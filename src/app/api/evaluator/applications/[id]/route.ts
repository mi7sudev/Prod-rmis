// ============================================================================
// RMIS — Evaluator application detail + status decision (spec §6.5, §7.9,
// §9.3). GET serves the full Review Dossier assembled by lib/review-dossier —
// the ONE seam for the frozen snapshots (never live profile data), the live
// requirements report and the MOM 2026-10-13 re-apply history. PATCH writes a
// settable status and fans out the notification doctrine: audit → in-app
// notification → SMS (skipped for silent-revert "Applied" and the rejected
// family) → routed email.
// ============================================================================

import { db } from "@/lib/db";
import { ok, ApiError, handleApi, parseId } from "@/lib/api";
import { requireRouteAccess } from "@/lib/role-policy";
import { getStatusMeta, isRejectedStatus, decideStatusTransition } from "@/lib/status";
import { statusUpdateSchema } from "@/lib/validation";
import { auditNotice, createInAppNotification } from "@/lib/notice-fanout";
import { applicantMiniSelect, readDossier, type ApplicantMiniRow } from "@/lib/review-dossier";
import {
  sendEmail,
  sendSms,
  smsRecipient,
  smsStatusChanged,
  emailStatusChanged,
  emailUnderReview,
  emailShortlisted,
  emailRegretLetter,
} from "@/lib/notify";

function applicantName(a: ApplicantMiniRow): string {
  return [a.firstName, a.lastName].filter(Boolean).join(" ") || "Applicant";
}

// ── GET /api/evaluator/applications/[id] — full Review Dossier ──────────────

export const GET = handleApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireRouteAccess(req, "evaluator/applications/[id]", "GET");
  const id = parseId((await ctx.params).id);
  return ok(await readDossier(id));
});

// ── PATCH /api/evaluator/applications/[id] — status decision ────────────────

export const PATCH = handleApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireRouteAccess(req, "evaluator/applications/[id]", "PATCH");
  const id = parseId((await ctx.params).id);

  const body = await req.json().catch(() => ({}));
  const input = statusUpdateSchema.parse(body);

  const app = await db.application.findUnique({
    where: { id },
    include: {
      job: { include: { position: true } },
      applicant: { select: applicantMiniSelect },
    },
  });
  if (!app) throw new ApiError("Application not found", 404);

  const from = app.status;
  const to = input.status;
  const normalizedLabel = getStatusMeta(to).label;
  const jobTitle = app.job.position?.positionTitle || app.job.title;
  const applicant = app.applicant;

  // ── Transition law (audit 2026-10-22) ─────────────────────────────────
  // Forbidden: resurrecting a final decision. No-op: re-deciding the same
  // canonical stage (idempotent — no update, no audit, no notifications).
  const decision = decideStatusTransition(from, to);
  if (decision.kind === "forbidden") throw new ApiError(decision.error, 409);
  if (decision.kind === "no-op") {
    return ok({ ...app, status: app.status });
  }

  // Optimistic concurrency: the write only lands while the status is still
  // exactly what this evaluator read — two concurrent evaluators can no
  // longer last-write-win over each other.
  const updatedCount = await db.application.updateMany({
    where: { id, status: from },
    data: { status: to, reason: input.reason ?? null, updatedAt: new Date() },
  });
  if (updatedCount.count === 0) {
    throw new ApiError(
      "The application status changed while you were working. Refresh the workspace and try again.",
      409
    );
  }
  const updated = await db.application.findUniqueOrThrow({ where: { id } });

  // ── Side effects — best-effort, never break the decision (spec §9.1) ────
  // Ledger + side-channel bookkeeping (audit row, in-app notification) is the
  // shared Notice fan-out (lib/notice-fanout); the channel matrix below —
  // which status triggers which message and which recipient is skipped — is
  // the §9.3 doctrine and stays with the route. sendEmail / sendSms never
  // throw (Tier-1 hard contract), so the decision cannot be broken here.

  // 1. Audit trail.
  auditNotice(user, req, {
    action: "APPLICATION_STATUS_CHANGED",
    entityId: id,
    description: `Application ${id} status changed: ${from} → ${to}${input.reason ? ` (reason: ${input.reason})` : ""}`,
  });

  // 2. In-app notification — skipped for the silent-revert "Applied" write
  //    (spec §4.3 / §9.3: no SMS, no email, no notification on revert).
  if (to !== "Applied") {
    await createInAppNotification(
      app.applicantId,
      "Application update",
      `Your application for ${jobTitle}: ${normalizedLabel}`
    );
  }

  // 3. SMS — skipped for the silent-revert "Applied" write and the rejected
  //    family (regret letters deliberately carry no SMS, spec §9.3).
  if (to !== "Applied" && !isRejectedStatus(to)) {
    await sendSms({
      // Task 72 — mobileNumber is the live profile contract; contactNumber legacy.
      to: smsRecipient(applicant),
      message: smsStatusChanged(normalizedLabel, jobTitle, input.reason),
      relatedType: "application",
      relatedId: id,
    });
  }

  // 4. Email routed by status (spec §9.3).
  if (isRejectedStatus(to)) {
    const t = emailRegretLetter(applicantName(applicant), jobTitle);
    await sendEmail({
      to: applicant.emailAddress ?? "",
      subject: t.subject,
      bodyText: t.bodyText,
      bodyHtml: t.bodyHtml,
      relatedType: "application",
      relatedId: id,
    });
  } else if (to === "Shortlisted") {
    const t = emailShortlisted(applicantName(applicant), jobTitle);
    await sendEmail({
      to: applicant.emailAddress ?? "",
      subject: t.subject,
      bodyText: t.bodyText,
      bodyHtml: t.bodyHtml,
      relatedType: "application",
      relatedId: id,
    });
  } else if (to === "Under Review") {
    const t = emailUnderReview(applicantName(applicant), jobTitle);
    await sendEmail({
      to: applicant.emailAddress ?? "",
      subject: t.subject,
      bodyText: t.bodyText,
      bodyHtml: t.bodyHtml,
      relatedType: "application",
      relatedId: id,
    });
  } else if (to !== "Applied") {
    const t = emailStatusChanged(applicantName(applicant), jobTitle, normalizedLabel, input.reason);
    await sendEmail({
      to: applicant.emailAddress ?? "",
      subject: t.subject,
      bodyText: t.bodyText,
      bodyHtml: t.bodyHtml,
      relatedType: "application",
      relatedId: id,
    });
  }
  // literal "Applied" (silent revert) → no email

  return ok({ ...updated, status: to });
});
