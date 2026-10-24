// ============================================================================
// RMIS — Contact Request replies (Task 27, QA 2026-10: evaluators answer
// inquiries from the Contact Requests view modal).
//   GET  ?id= — reply thread: the last 20 email_logs rows stamped
//               relatedType "contact-request" / relatedId <id> (oldest last).
//   POST { id, message, subject? } — sends the HR reply by email. The
//          recipient is ALWAYS resolved server-side from the stored
//          ContactRequest row (the email the sender submitted through the
//          public Contact page) — never taken from the request body.
//          20 sends/user/10 min. Every send is audited + logged to email_logs
//          so the modal can show the full reply history.
// ============================================================================

import { z } from "zod";
import { handleApi, ok, err, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import type { AuthedUser } from "@/lib/auth";
import { requireRouteAccess } from "@/lib/role-policy";
import { directEmailSchema } from "@/lib/validation";
import { consumeRateLimit } from "@/lib/rate-limit";
import { auditNotice } from "@/lib/notice-fanout";
import { sendEmail, emailDirect } from "@/lib/notify";

export const dynamic = "force-dynamic";

const getSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// ── GET — the reply thread for one request ──────────────────────────────────

export const GET = handleApi(async (req: Request) => {
  await requireRouteAccess(req, "admin/contact-requests/reply", "GET");

  const url = new URL(req.url);
  const parsed = getSchema.safeParse({ id: url.searchParams.get("id") });
  if (!parsed.success) throw new ApiError("Invalid request", 422);

  const exists = await db.contactRequest.findUnique({
    where: { id: parsed.data.id },
    select: { id: true },
  });
  if (!exists) throw new ApiError("Contact request not found", 404);

  const logs = await db.emailLog.findMany({
    where: { relatedType: "contact-request", relatedId: parsed.data.id },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  return ok({
    replies: logs.map((log) => ({
      id: log.id,
      to: log.to,
      subject: log.subject,
      status: log.status,
      provider: log.provider,
      error: log.error,
      createdAt: log.createdAt,
    })),
  });
});

// ── POST — email a reply to the requester ───────────────────────────────────

function senderLabel(user: AuthedUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
}

export const POST = handleApi(async (req: Request) => {
  const user = await requireRouteAccess(req, "admin/contact-requests/reply", "POST");

  // Rate limit: 20 replies per user per 10 minutes (mirrors direct email).
  const limit = consumeRateLimit(`contact-reply:${user.id}`, 20, 600_000);
  if (!limit.allowed) {
    throw new ApiError(
      `Too many replies sent. Please try again in ${limit.retryAfterMinutes ?? 10} minute(s).`,
      429
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = directEmailSchema.extend({ id: z.number().int().positive() }).safeParse(body);
  if (!parsed.success) throw new ApiError("Invalid request", 422);
  const { id, subject, message } = parsed.data;

  // The request row owns the destination: the email address the sender
  // submitted through the public Contact page, retrieved from the live
  // record (same trust model as the direct-email route).
  const request = await db.contactRequest.findUnique({ where: { id } });
  if (!request) throw new ApiError("Contact request not found", 404);
  const recipient = request.email?.trim() ?? "";
  if (!recipient || !recipient.includes("@")) {
    throw new ApiError("No email address on the request; reply by phone instead.", 400);
  }

  const template = emailDirect(
    senderLabel(user),
    subject?.trim() || `Re: ${request.subject}`,
    message
  );
  const email = await sendEmail({
    to: recipient,
    subject: template.subject,
    bodyText: template.bodyText,
    bodyHtml: template.bodyHtml,
    relatedType: "contact-request",
    relatedId: id,
  });

  auditNotice(user, req, {
    action: "CONTACT_REQUEST_REPLIED",
    entityType: "ContactRequest",
    entityId: id,
    description: `Reply emailed for contact request #${id} to ${recipient} (status: ${email.status})`,
  });

  if (email.status === "failed") {
    return err("Reply delivery failed", 502);
  }

  return ok({ email });
});
