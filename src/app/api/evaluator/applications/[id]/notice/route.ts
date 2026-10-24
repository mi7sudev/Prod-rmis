// ============================================================================
// RMIS — MOM notices (spec §6.5, §7.9, §9.3). Notice history is derived from
// email_logs subject prefixes. Sending guards (doctrine, §9.3):
//   - regret is NEVER sent to a shortlisted-stage application (409)
//   - interview / skills-exam ONLY to shortlisted-stage applications (409)
//   - non-regret notices require date + time + venue (400)
// Each send fans out email + companion SMS + in-app notification + audit.
// ============================================================================

import { db } from "@/lib/db";
import { ok, ApiError, handleApi, parseId } from "@/lib/api";
import { requireRouteAccess } from "@/lib/role-policy";
import { stageForStatus } from "@/lib/status";
import { noticeSchema } from "@/lib/validation";
import { safeJsonParse } from "@/lib/snapshot";
import { auditNotice, createInAppNotification } from "@/lib/notice-fanout";
import {
  sendEmail,
  sendSms,
  smsRecipient,
  smsNotice,
  emailRegretLetter,
  emailInterviewInvitation,
  emailSkillsExam,
} from "@/lib/notify";

const SUBJECT_PREFIXES: [string, "regret" | "interview" | "skills_exam"][] = [
  ["Application Status Update –", "regret"],
  ["Application regret:", "regret"],
  // Pre-R-02 subjects used an em dash in the regret prefix.
  ["Application regret —", "regret"],
  ["Interview invitation", "interview"],
  ["Skills examination", "skills_exam"],
];


// ── GET — notice history from email_logs ────────────────────────────────────

export const GET = handleApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireRouteAccess(req, "evaluator/applications/[id]/notice", "GET");
  const id = parseId((await ctx.params).id);

  const app = await db.application.findUnique({ where: { id }, select: { id: true } });
  if (!app) throw new ApiError("Application not found", 404);

  const logs = await db.emailLog.findMany({
    where: { relatedType: "application", relatedId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, subject: true, status: true, to: true, createdAt: true },
  });

  const notices = logs
    .map((log) => {
      const hit = SUBJECT_PREFIXES.find(([prefix]) => log.subject.startsWith(prefix));
      return hit ? { id: log.id, type: hit[1], subject: log.subject, status: log.status, to: log.to, sentAt: log.createdAt } : null;
    })
    .filter((n): n is NonNullable<typeof n> => n !== null);

  return ok({ notices });
});

// ── POST — send a notice (regret | interview | skills_exam) ─────────────────

export const POST = handleApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireRouteAccess(req, "evaluator/applications/[id]/notice", "POST");
  const id = parseId((await ctx.params).id);

  const app = await db.application.findUnique({
    where: { id },
    include: {
      job: { include: { position: true } },
      applicant: { select: { id: true, firstName: true, lastName: true, emailAddress: true, mobileNumber: true, contactNumber: true } },
    },
  });
  if (!app) throw new ApiError("Application not found", 404);

  const body = await req.json().catch(() => ({}));
  const input = noticeSchema.parse(body);

  // ── Doctrine guards (spec §9.3) ─────────────────────────────────────────
  const stage = stageForStatus(app.status);
  const mode: "face_to_face" | "online" = input.mode === "online" ? "online" : "face_to_face";
  // Regret letters apply only while the application is still pre-shortlist
  // live pipeline (Applied / Under Review) — never to a shortlisted one and
  // never to a final state (withdrawn = the applicant already has their
  // answer; legacy DRAFT/PENDING map onto Applied) — audit 2026-10-22.
  if (input.type === "regret" && !["Applied", "Under Review"].includes(stage)) {
    throw new ApiError(
      stage === "Shortlisted"
        ? "This application was shortlisted; a regret letter is not applicable."
        : "This application has a final status; a regret letter is not applicable.",
      409
    );
  }
  if ((input.type === "interview" || input.type === "skills_exam") && stage !== "Shortlisted") {
    throw new ApiError("Interview and skills-exam notices can only be sent to shortlisted applications.", 409);
  }
  if (input.type !== "regret") {
    if (!input.date || !input.time) {
      throw new ApiError("Date and time are required for this notice.", 400);
    }
    // MOM 2026-10-13: a face-to-face setup needs a venue; an online setup
    // needs the meeting link instead.
    if (mode === "online" && !input.meetingLink?.trim()) {
      throw new ApiError("A meeting link is required for an online notice.", 400);
    }
    if (mode === "face_to_face" && !input.venue?.trim()) {
      throw new ApiError("A venue is required for a face-to-face notice.", 400);
    }
  }

  // Applicant name prefers the frozen snapshot, falls back to the live record.
  const profile = safeJsonParse<{ firstName?: string | null; lastName?: string | null } | null>(
    app.snapshotProfile,
    null
  );
  const name =
    [profile?.firstName || app.applicant.firstName, profile?.lastName || app.applicant.lastName]
      .filter(Boolean)
      .join(" ") || "Applicant";
  // The office's real emails cite the position WITH its item number
  // ("Metals Technologist III (MIRDCB-MTEK3-10-1998)").
  const pos = app.job.position;
  const title = pos?.positionTitle
    ? `${pos.positionTitle}${pos.itemNumber ? ` (${pos.itemNumber})` : ""}`
    : app.job.title;
  const recipient = app.applicant.emailAddress ?? "";
  // Task 72 — SMS rides the applicant's mobileNumber (profile contract);
  // contactNumber is the legacy fallback.
  const mobile = smsRecipient(app.applicant);

  const details = {
    date: input.date ?? undefined,
    time: input.time ?? undefined,
    venue: input.venue ?? undefined,
    contact: input.contact ?? undefined,
    notes: input.notes ?? undefined,
    examType: input.examType ?? undefined,
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
        time: input.time ?? undefined,
        venue: input.venue ?? undefined,
      },
      ...(input.extraStages ?? []).map((s) => ({
        title: s.title,
        time: s.time || undefined,
        venue: s.venue || undefined,
      })),
    ],
  };

  // ── Fan out: email + companion SMS + in-app notification (§9.3) ─────────
  let emailSubject = "";
  let smsText = "";

  if (input.type === "regret") {
    const t = emailRegretLetter(name, title);
    emailSubject = t.subject;
    const email = await sendEmail({
      to: recipient,
      subject: t.subject,
      bodyText: t.bodyText,
      bodyHtml: t.bodyHtml,
      relatedType: "application",
      relatedId: id,
    });
    smsText = `RMIS: We regret to inform you that you were not shortlisted for the position ${title}.`;
    const sms = await sendSms({ to: mobile, message: smsNotice(smsText), relatedType: "application", relatedId: id });
    // Best-effort — the email and SMS are already out; a notification-row
    // failure must never 500 the request AFTER delivery (audit 2026-10-22).
    await createInAppNotification(
      app.applicantId,
      "Notice",
      `A regret letter was sent for your application for ${title}.`
    );
    auditNotice(user, req, {
      action: "NOTICE_SENT",
      entityId: id,
      description: `Regret letter sent for application ${id} (email: ${email.status}, sms: ${sms.status})`,
    });
    return ok({ type: input.type, email, sms });
  }

  const email =
    input.type === "interview"
      ? await (async () => {
          const t = emailInterviewInvitation(name, title, details);
          emailSubject = t.subject;
          return sendEmail({
            to: recipient,
            subject: t.subject,
            bodyText: t.bodyText,
            bodyHtml: t.bodyHtml,
            relatedType: "application",
            relatedId: id,
          });
        })()
      : await (async () => {
          const t = emailSkillsExam(name, title, details);
          emailSubject = t.subject;
          return sendEmail({
            to: recipient,
            subject: t.subject,
            bodyText: t.bodyText,
            bodyHtml: t.bodyHtml,
            relatedType: "application",
            relatedId: id,
          });
        })();

  smsText =
    input.type === "interview"
      ? `You are invited to an interview for ${title} on ${input.date} at ${input.time}.${mode === "online" ? ` Online: ${input.meetingLink}` : `, ${input.venue}`}.`
      : `You are invited to a skills examination for ${title} on ${input.date} at ${input.time}.${mode === "online" ? ` Online: ${input.meetingLink}` : `, ${input.venue}`}.`;
  const sms = await sendSms({ to: mobile, message: smsNotice(smsText), relatedType: "application", relatedId: id });

  await createInAppNotification(
    app.applicantId,
    "Notice",
    input.type === "interview"
      ? `Interview invitation sent for ${title}: ${input.date} at ${input.time}${mode === "online" ? " (Online)" : `, ${input.venue}`}.`
      : `Skills examination notice sent for ${title}: ${input.date} at ${input.time}${mode === "online" ? " (Online)" : `, ${input.venue}`}.`
  );

  auditNotice(user, req, {
    action: "NOTICE_SENT",
    entityId: id,
    description: `${emailSubject || "Notice"} sent for application ${id} (email: ${email.status}, sms: ${sms.status})`,
  });

  return ok({ type: input.type, email, sms });
});
