// ============================================================================
// RMIS — Bulk regret letters (spec §6.5, §9.3; MOM 2026-10-13 wording). 1..200
// application ids per batch, deduped. Skips: not found; shortlisted-stage
// (hard skip); already successfully sent (subject-prefix idempotency keys —
// the MOM subject "Application Status Update –" plus the legacy
// "Application regret" prefixes — with status sent/mock; failed/skipped
// attempts are retried). Each eligible send fans out regret email +
// "not shortlisted" SMS + in-app notification.
// ============================================================================

import { z } from "zod";
import { db } from "@/lib/db";
import { ok, ApiError, handleApi } from "@/lib/api";
import { requireRouteAccess } from "@/lib/role-policy";
import { stageForStatus, isTerminalApplicationStatus } from "@/lib/status";
import { safeJsonParse } from "@/lib/snapshot";
import { auditNotice, createInAppNotification, createNoticeBatch } from "@/lib/notice-fanout";
import { sendEmail, sendSms, smsRecipient, smsNotice, emailRegretLetter } from "@/lib/notify";

const bodySchema = z.object({
  applicationIds: z.array(z.number().int()).min(1, "At least one application id is required").max(200, "A maximum of 200 applications per batch"),
});

/** MOM 2026-10-13 subject. Idempotency/history keys match on it. */
const REGRET_PREFIX = "Application Status Update –";
/** Pre-MOM subjects — kept matching for idempotency/history. */
const REGRET_LEGACY_PREFIXES = ["Application regret:", "Application regret —"];

export const POST = handleApi(async (req: Request) => {
  const user = await requireRouteAccess(req, "evaluator/applications/regrets", "POST");

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.parse(body);
  const ids = [...new Set(parsed.applicationIds)]; // dedupe

  // Per-recipient ledger — the ONE fan-out bookkeeping (lib/notice-fanout):
  // outcome classification (only sent/mock is a delivery; a "skipped" send is
  // its own outcome, never "sent" — Task 78), summary counting and result
  // rows. The buckets below are the wire summary keys, in response order.
  const batch = createNoticeBatch(
    { total: 0, sent: 0, skipped: 0, alreadySent: 0, shortlisted: 0, final: 0, failed: 0, notFound: 0 },
    {
      sent: "sent",
      skipped: "skipped",
      failed: "failed",
      already_sent: "alreadySent",
      shortlisted: "shortlisted",
      final: "final",
      not_found: "notFound",
    }
  );

  for (const applicationId of ids) {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      include: {
        job: { include: { position: true } },
        applicant: { select: { id: true, firstName: true, lastName: true, emailAddress: true, mobileNumber: true, contactNumber: true } },
      },
    });

    if (!app) {
      batch.skip(applicationId, "not_found");
      continue;
    }

    // Hard skip: regret is never sent to a shortlisted-stage application, nor
    // to a FINAL one (withdrawn = the applicant already has their answer;
    // audit 2026-10-22 — the old guard only caught Shortlisted).
    if (stageForStatus(app.status) === "Shortlisted") {
      batch.skip(applicationId, "shortlisted");
      continue;
    }
    if (isTerminalApplicationStatus(app.status)) {
      batch.skip(applicationId, "final");
      continue;
    }

    // Idempotency: prior successful regret email (sent/mock) blocks a resend;
    // failed/skipped attempts are retried (spec §9.3).
    const prior = await db.emailLog.findFirst({
      where: {
        relatedType: "application",
        relatedId: applicationId,
        OR: [{ subject: { startsWith: REGRET_PREFIX } }, ...REGRET_LEGACY_PREFIXES.map((p) => ({ subject: { startsWith: p } }))],
        status: { in: ["sent", "mock"] },
      },
      select: { id: true },
    });
    if (prior) {
      batch.skip(applicationId, "already_sent");
      continue;
    }

    const profile = safeJsonParse<{ firstName?: string | null; lastName?: string | null } | null>(
      app.snapshotProfile,
      null
    );
    const name =
      [profile?.firstName || app.applicant.firstName, profile?.lastName || app.applicant.lastName]
        .filter(Boolean)
        .join(" ") || "Applicant";
    const title = app.job.position?.positionTitle || app.job.title;

    const template = emailRegretLetter(name, title);
    const email = await sendEmail({
      to: app.applicant.emailAddress ?? "",
      subject: template.subject,
      bodyText: template.bodyText,
      bodyHtml: template.bodyHtml,
      relatedType: "application",
      relatedId: applicationId,
    });
    const sms = await sendSms({
      to: smsRecipient(app.applicant),
      message: smsNotice(
        `RMIS: We regret to inform you that you were not shortlisted for the position ${title}.`
      ),
      relatedType: "application",
      relatedId: applicationId,
    });

    await createInAppNotification(
      app.applicantId,
      "Notice",
      `We regret to inform you that you were not shortlisted for ${title}.`
    );

    // Delivery truth (audit 2026-10-22) is the ledger's: only sent/mock is a
    // delivery — a "skipped" send (no address on file) is its own outcome,
    // never "sent".
    batch.deliver(applicationId, email, sms);
  }

  const { summary, results } = batch.finish(ids.length);

  auditNotice(user, req, {
    action: "REGRET_LETTERS_BULK_SENT",
    entityId: null,
    description: `Bulk regret letters, batch of ${summary.total}: ${summary.sent} sent, ${summary.skipped} skipped (no address), ${summary.alreadySent} already sent, ${summary.shortlisted} shortlisted (skipped), ${summary.final} final (skipped), ${summary.failed} failed, ${summary.notFound} not found`,
  });

  return ok({ summary, results });
});
