// ============================================================================
// RMIS — Bulk interview / skills-exam invitations (MOM 2026-10-13). Bulk-send
// email feature for SHORTLISTED applicants of specific job listings: 1..200
// application ids per batch, deduped, with one shared notice payload (date,
// time, setup mode face-to-face/online + meeting link, HR contact, and the
// long-text "Invitation Details"). Skips: not found; non-shortlisted stage
// (hard skip); already successfully sent for the SAME notice type
// (subject-prefix idempotency — failed attempts are retried). Each eligible
// send fans out email + companion SMS + in-app notification + audit.
// ============================================================================

import { db } from "@/lib/db";
import { ok, ApiError, handleApi } from "@/lib/api";
import { requireRouteAccess } from "@/lib/role-policy";
import { stageForStatus } from "@/lib/status";
import { bulkNoticeSchema } from "@/lib/validation";
import { safeJsonParse } from "@/lib/snapshot";
import { auditNotice, createInAppNotification, createNoticeBatch } from "@/lib/notice-fanout";
import { sendEmail, sendSms, smsRecipient, smsNotice, emailInterviewInvitation, emailSkillsExam } from "@/lib/notify";

const INTERVIEW_PREFIX = "Interview invitation";
const EXAM_PREFIX = "Skills examination";

export const POST = handleApi(async (req: Request) => {
  const user = await requireRouteAccess(req, "evaluator/applications/invitations", "POST");

  const body = await req.json().catch(() => ({}));
  const input = bulkNoticeSchema.parse(body);
  if (input.type === "regret") {
    throw new ApiError("Use the regret-letter flow for rejection notices.", 400);
  }
  const ids = [...new Set(input.applicationIds)]; // dedupe
  const mode: "face_to_face" | "online" = input.mode === "online" ? "online" : "face_to_face";

  // Shared-payload guards (same doctrine as the single-notice route).
  if (!input.date?.trim() || !input.time?.trim()) {
    throw new ApiError("Date and time are required.", 400);
  }
  if (mode === "online" && !input.meetingLink?.trim()) {
    throw new ApiError("A meeting link is required for an online invitation.", 400);
  }
  if (mode === "face_to_face" && !input.venue?.trim()) {
    throw new ApiError("A venue is required for a face-to-face invitation.", 400);
  }

  // Per-recipient ledger — the ONE fan-out bookkeeping (lib/notice-fanout):
  // outcome classification (only sent/mock is a delivery; a "skipped" send is
  // its own outcome, never "sent" — Task 78), summary counting and result
  // rows. The buckets below are the wire summary keys, in response order.
  const batch = createNoticeBatch(
    { total: 0, sent: 0, skipped: 0, alreadySent: 0, notShortlisted: 0, failed: 0, notFound: 0 },
    {
      sent: "sent",
      skipped: "skipped",
      failed: "failed",
      already_sent: "alreadySent",
      not_shortlisted: "notShortlisted",
      not_found: "notFound",
    }
  );

  const subjectPrefix = input.type === "interview" ? INTERVIEW_PREFIX : EXAM_PREFIX;

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

    // Hard skip: interview / exam notices go ONLY to shortlisted applications.
    if (stageForStatus(app.status) !== "Shortlisted") {
      batch.skip(applicationId, "not_shortlisted");
      continue;
    }

    // Idempotency: a prior successful notice of the SAME type blocks a resend
    // (use the single-application dialog to send updated details).
    const prior = await db.emailLog.findFirst({
      where: {
        relatedType: "application",
        relatedId: applicationId,
        subject: { startsWith: subjectPrefix },
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
    // The office's real emails cite the position WITH its item number.
    const pos = app.job.position;
    const title = pos?.positionTitle
      ? `${pos.positionTitle}${pos.itemNumber ? ` (${pos.itemNumber})` : ""}`
      : app.job.title;

    const details = {
      date: input.date,
      time: input.time,
      venue: input.venue ?? undefined,
      contact: input.contact ?? undefined,
      notes: input.notes ?? undefined,
      examType: input.type === "skills_exam" ? input.examType ?? undefined : undefined,
      mode,
      meetingLink: input.meetingLink ?? undefined,
      // One-day process: stage 1 from the main fields, 2..N from extraStages.
      stages: [
        {
          title:
            input.type === "interview"
              ? mode === "online"
                ? "Online Interview"
                : "Face-to-face Interview"
              : `Skills Examination${input.examType ? ` — ${input.examType}` : ""}`,
          time: input.time,
          venue: input.venue ?? undefined,
        },
        ...(input.extraStages ?? []).map((s) => ({
          title: s.title,
          time: s.time || undefined,
          venue: s.venue || undefined,
        })),
      ],
    };

    const template =
      input.type === "interview"
        ? emailInterviewInvitation(name, title, details)
        : emailSkillsExam(name, title, details);

    const email = await sendEmail({
      to: app.applicant.emailAddress ?? "",
      subject: template.subject,
      bodyText: template.bodyText,
      bodyHtml: template.bodyHtml,
      relatedType: "application",
      relatedId: applicationId,
    });
    const smsText = `You are invited to ${input.type === "interview" ? "an interview" : "a skills examination"} for ${title} on ${input.date} at ${input.time}.${mode === "online" ? ` Online: ${input.meetingLink}` : `, ${input.venue}`}.`;
    const sms = await sendSms({
      to: smsRecipient(app.applicant),
      message: smsNotice(smsText),
      relatedType: "application",
      relatedId: applicationId,
    });

    await createInAppNotification(
      app.applicantId,
      "Notice",
      `${input.type === "interview" ? "Interview invitation" : "Skills examination notice"} sent for ${title}: ${input.date} at ${input.time}${mode === "online" ? " (Online)" : `, ${input.venue}`}.`
    );

    batch.deliver(applicationId, email, sms);
  }

  const { summary, results } = batch.finish(ids.length);

  auditNotice(user, req, {
    action: "NOTICES_BULK_SENT",
    entityId: null,
    description: `Bulk ${input.type === "interview" ? "interview invitations" : "skills-exam notices"}, batch of ${summary.total}: ${summary.sent} sent, ${summary.skipped} skipped (no address), ${summary.alreadySent} already sent, ${summary.notShortlisted} not shortlisted (skipped), ${summary.failed} failed, ${summary.notFound} not found`,
  });

  return ok({ summary, results });
});
