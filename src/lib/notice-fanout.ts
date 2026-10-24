// ============================================================================
// RMIS — The Notice fan-out (architecture candidate ③, Task 79 report).
// ONE seam for the bookkeeping every notice-sending route fans out around a
// delivery: the audit row, the best-effort in-app notification, the per-
// recipient outcome ledger (sent / skipped / failed counting) and the
// canonical actor label. Delivery itself stays in the FROZEN sender
// (lib/notify.ts — sendEmail / sendSms, Tier 1): this module never sends, it
// keeps the ledger and the side-channel rows honest while the routes keep
// their own channel matrix (which status triggers which template, the
// silent-revert "Applied" skip, the no-SMS rejected family — spec §9.3).
//
// Doctrine encoded here (audit 2026-10-22 / Task 78):
//   - "skipped is its own outcome": only sent/mock is a delivery; a skipped
//     send (no address on file) is never counted as sent.
//   - notification.create is BEST-EFFORT — a row failure must never 500 the
//     request after delivery.
//   - audit rows speak the canonical AUDIT_ACTIONS vocabulary and the
//     canonical userLabelOf actor label.
//   - The outcome vocabulary ("sent" | "skipped" | "failed") is the server
//     twin of the delivery-status chip vocabulary in lib/status-ui
//     (deliveryStatusMeta: Sent / Skipped / Failed + the mock ledger status),
//     so the ledgers these routes produce and the chips staff see cannot
//     drift apart. The UI module itself is deliberately NOT imported here —
//     server bundles stay free of presentation code (81-e discipline).
// ============================================================================

import { db } from "@/lib/db";
import { getClientIp } from "@/lib/api";
import type { AuthedUser } from "@/lib/auth";
import { AUDIT_ACTIONS, auditLog, userLabelOf } from "@/lib/audit";
import type { SendResult } from "@/lib/notify";

// ── Delivery outcome classification (Task 78 semantics) ─────────────────────

/** The fan-out ledger outcome for one recipient. The wire twin of the
 *  delivery-status vocabulary that lib/status-ui renders as chips. */
export type NoticeDeliveryOutcome = "sent" | "skipped" | "failed";

/** Classify a sender result into the ledger outcome. ONLY sent/mock is a
 *  delivery — a "skipped" send (no valid address on file) is its own outcome,
 *  never "sent"; everything else failed. */
export function deliveryOutcome(status: SendResult["status"]): NoticeDeliveryOutcome {
  if (status === "sent" || status === "mock") return "sent";
  if (status === "skipped") return "skipped";
  return "failed";
}

// ── Best-effort in-app notification row ─────────────────────────────────────

/** Create the applicant's in-app notification row. BEST-EFFORT: email/SMS are
 *  already out by the time this runs — a notification-row failure must never
 *  500 the request AFTER delivery (audit 2026-10-22). */
export async function createInAppNotification(
  applicantId: number,
  name: string,
  description: string
): Promise<void> {
  try {
    await db.notification.create({
      data: { applicantId, name, description },
    });
  } catch {
    // Best-effort — see the doctrine note above.
  }
}

// ── Audit-row emission (canonical actor + action vocabulary) ────────────────

/** Emit the notice-family audit row: canonical AUDIT_ACTIONS action, the
 *  canonical userLabelOf actor label, and the spoof-resistant client IP.
 *  entityType defaults to "application" (the dominant notice subject); the
 *  direct channels override it (e.g. "ContactRequest"). Fire-and-forget —
 *  auditLog itself never breaks the operation (spec §11). */
export function auditNotice(
  user: Pick<AuthedUser, "id" | "username" | "email" | "role">,
  req: Request,
  event: {
    action: (typeof AUDIT_ACTIONS)[number];
    entityType?: string;
    entityId?: number | string | null;
    description: string;
  }
): void {
  auditLog({
    userId: user.id,
    userLabel: userLabelOf(user),
    userRole: user.role,
    action: event.action,
    entityType: event.entityType ?? "application",
    entityId: event.entityId,
    description: event.description,
    ipAddress: getClientIp(req),
  });
}

// ── Per-recipient outcome ledger (bulk notice batches) ──────────────────────

/** One results row of a bulk notice batch. Skip rows carry only the outcome
 *  literal; rows that reached the channels carry both delivery statuses. */
export type NoticeBatchRow<Outcome extends string> =
  | { applicationId: number; outcome: Outcome }
  | {
      applicationId: number;
      outcome: Outcome;
      emailStatus: string;
      smsStatus: string;
      error?: string;
    };

type NoticeBatchSummaryShape = { total: number } & Record<string, number>;

export interface NoticeBatch<Outcome extends string, Summary> {
  /** A recipient that never reached the send (skip doctrine: not found,
   *  wrong stage, already sent…). Counts the outcome's summary bucket and
   *  records the bare skip row. */
  skip(applicationId: number, outcome: Outcome): void;
  /** A recipient that reached both channels. The outcome is classified from
   *  the email SendResult ("skipped is its own outcome" — Task 78) and the
   *  row records both channel statuses verbatim. */
  deliver(applicationId: number, email: SendResult, sms: SendResult): void;
  /** Freeze the batch: set the total and hand back the wire payload
   *  ({ summary, results }) exactly as the routes return it. */
  finish(total: number): { summary: Summary; results: NoticeBatchRow<Outcome>[] };
}

/**
 * The ONE per-recipient outcome ledger behind the bulk notice routes.
 * blankSummary declares the wire shape (key ORDER included — start with
 * total: 0, then the buckets in response order); bucketByOutcome maps every
 * outcome literal the route can record onto a summary bucket, so a new skip
 * reason is a compile error until it has a bucket.
 */
export function createNoticeBatch<
  Outcome extends string,
  Summary extends NoticeBatchSummaryShape,
>(
  blankSummary: Summary,
  bucketByOutcome: Readonly<Record<Outcome, Exclude<keyof Summary, "total">>>
): NoticeBatch<Outcome, Summary> {
  const summary = { ...blankSummary } as Record<string, number>;
  const results: NoticeBatchRow<Outcome>[] = [];

  const count = (outcome: Outcome | NoticeDeliveryOutcome): void => {
    const bucket = bucketByOutcome[outcome as Outcome] as string;
    summary[bucket] += 1;
  };

  return {
    skip(applicationId, outcome) {
      count(outcome);
      results.push({ applicationId, outcome });
    },
    deliver(applicationId, email, sms) {
      const outcome = deliveryOutcome(email.status);
      count(outcome);
      // The delivery outcomes are always members of the route's outcome
      // vocabulary (sent/skipped/failed are in every batch's bucket map).
      results.push({
        applicationId,
        outcome: outcome as Outcome,
        emailStatus: email.status,
        smsStatus: sms.status,
        error: email.error,
      });
    },
    finish(total) {
      summary.total = total;
      return { summary: summary as Summary, results };
    },
  };
}
