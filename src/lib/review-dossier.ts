// ============================================================================
// RMIS — The Review Dossier (spec §6.5, §7.8, §7.9, §8.2, §8.8). ONE domain
// module for what an Evaluator judges an Applicant by:
//   · frozen-snapshot deserialization (§8.8 — reviewer surfaces read ONLY the
//     application snapshots, never live profile data);
//   · live MQR/requirements recomputation vs the live Position CSC standards
//     (§8.2 — buildRequirementsReport is the single MQR engine, Task 78);
//   · the MOM 2026-10-13 re-apply doctrine — the applicant's prior
//     REJECTED/DECLINED applications for the SAME posting, WITHDRAWN never
//     counting (the applicant's own action, not a rejection verdict) and the
//     current application never counting (a rejection must not become its own
//     history);
//   · the wire shape both staff surfaces serve (detail dossier + queue rows).
// The wire types live in review-dossier-types (client-safe) — architecture
// candidates ① + ②, 2026-10-22: the snapshot parse + requirements report used
// to be re-implemented in both staff routes and the payload type was
// re-declared a third time in review-workspace.tsx.
// ============================================================================

import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import {
  buildRequirementsReport,
  type PositionShape,
  type RequirementsReport,
  type SnapshotShape,
} from "@/lib/requirements";
import { isRejectedStatus } from "@/lib/status";
import { safeJsonParse } from "@/lib/snapshot";
import type {
  PriorRejections,
  ReviewDossier,
  ReviewSnapshotRow,
  ReviewSnapshotSet,
} from "@/lib/review-dossier-types";

export type {
  PriorRejections,
  ReviewDocumentRow,
  ReviewDossier,
  ReviewDossierApplicant,
  ReviewDossierPosition,
  ReviewMatchSummary,
  ReviewSnapshotRow,
  ReviewSnapshotSet,
} from "@/lib/review-dossier-types";

// ── Frozen snapshots (§8.8) ─────────────────────────────────────────────────

/** The frozen snapshot columns an application row carries. */
export type SnapshotColumns = {
  snapshotProfile: string | null;
  snapshotEducations: string | null;
  snapshotExperiences: string | null;
  snapshotTrainings: string | null;
  snapshotEligibilities: string | null;
  snapshotAwards: string | null;
};

/** Parse the frozen snapshot columns ONCE per application (was re-parsed by
 *  every consumer route). Corrupt/missing columns fall back to empty. */
export function parseReviewSnapshots(cols: SnapshotColumns): ReviewSnapshotSet {
  return {
    profile: safeJsonParse<ReviewSnapshotRow | null>(cols.snapshotProfile, null),
    educations: safeJsonParse<ReviewSnapshotRow[]>(cols.snapshotEducations, []),
    experiences: safeJsonParse<ReviewSnapshotRow[]>(cols.snapshotExperiences, []),
    trainings: safeJsonParse<ReviewSnapshotRow[]>(cols.snapshotTrainings, []),
    eligibilities: safeJsonParse<ReviewSnapshotRow[]>(cols.snapshotEligibilities, []),
    awards: safeJsonParse<ReviewSnapshotRow[]>(cols.snapshotAwards, []),
  };
}

/** The requirements engine's typed projection of the schemaless snapshot rows
 *  (§8.2) — also the input of the display-only credential tag
 *  (lib/credential-tag). */
export function requirementsShapeFor(snapshots: ReviewSnapshotSet): SnapshotShape {
  return {
    educations: snapshots.educations as SnapshotShape["educations"],
    experiences: snapshots.experiences as SnapshotShape["experiences"],
    trainings: snapshots.trainings as SnapshotShape["trainings"],
    eligibilities: snapshots.eligibilities as SnapshotShape["eligibilities"],
  };
}

/** Live requirements recomputation — the frozen snapshots vs the live
 *  Position CSC standards. Never persisted (§8.2). */
export function requirementsReportFor(
  snapshots: ReviewSnapshotSet,
  position: PositionShape | null | undefined
): RequirementsReport {
  return buildRequirementsReport(requirementsShapeFor(snapshots), position ?? {});
}

// ── MOM 2026-10-13 — the Prior-Rejection History (re-apply doctrine) ────────
// ONE implementation. The detail route used to exclude the current row by id
// while the queue subtracted a self-COUNT from a pair-level tally — which let
// the newest rejection's date/reason be the current row's own when the current
// row was itself rejected. The unified rule computes count, lastDate and
// lastReason over the SAME set: earlier REJECTED/DECLINED applications for the
// pair with the current id removed. WITHDRAWN never counts — isRejectedStatus
// is the single WITHDRAWN ruling, consistent with the apply route's re-apply
// gate (terminal statuses free a re-apply) and the GLOSSARY "Terminal" note.

/** Application rows the doctrine consumes (any superset is fine). */
export type ReApplyHistoryRow = {
  id: number;
  status: string | null;
  dateApplied: Date;
  reason: string | null;
};

/** Compute the history for ONE (applicant, job) pair. `excludeId` removes the
 *  application whose dossier/row is being rendered (0 = exclude nothing). */
export function reApplyHistoryFrom(
  rows: ReApplyHistoryRow[],
  excludeId: number
): PriorRejections | null {
  const rejections = rows.filter((r) => r.id !== excludeId && isRejectedStatus(r.status));
  if (rejections.length === 0) return null;
  let last = rejections[0];
  for (const r of rejections) if (r.dateApplied > last.dateApplied) last = r;
  return {
    count: rejections.length,
    lastDate: last.dateApplied.toISOString(),
    lastReason: last.reason ?? null,
  };
}

/** Query + compute for a single pair (the detail dossier path). */
export async function reApplyHistory(
  applicantId: number,
  jobId: number,
  excludeId?: number
): Promise<PriorRejections | null> {
  const rows = await db.application.findMany({
    where: { applicantId, jobId },
    select: { id: true, status: true, dateApplied: true, reason: true },
    orderBy: { dateApplied: "desc" },
  });
  return reApplyHistoryFrom(rows, excludeId ?? 0);
}

/**
 * In-memory index of the prior-rejection rows per (applicant, job) pair — the
 * review queue computes every pair's history from the row set it already
 * holds (no extra queries). Feed the result through reApplyFromIndex.
 */
export function buildReApplyIndex(
  rows: (ReApplyHistoryRow & { applicantId: number; jobId: number })[]
): Map<string, ReApplyHistoryRow[]> {
  const index = new Map<string, ReApplyHistoryRow[]>();
  for (const r of rows) {
    if (!isRejectedStatus(r.status)) continue;
    const entry: ReApplyHistoryRow = {
      id: r.id,
      status: r.status,
      dateApplied: r.dateApplied,
      reason: r.reason,
    };
    const group = index.get(`${r.applicantId}:${r.jobId}`);
    if (group) group.push(entry);
    else index.set(`${r.applicantId}:${r.jobId}`, [entry]);
  }
  return index;
}

/** Read ONE row's history out of buildReApplyIndex's index — the current row
 *  is excluded by id, so a rejected row never becomes its own history. */
export function reApplyFromIndex(
  index: Map<string, ReApplyHistoryRow[]>,
  applicantId: number,
  jobId: number,
  excludeId: number
): PriorRejections | null {
  const rows = index.get(`${applicantId}:${jobId}`);
  return rows ? reApplyHistoryFrom(rows, excludeId) : null;
}

// ── The detail dossier (GET /api/evaluator/applications/[id]) ───────────────

/** Applicant projection carried by the dossier — also borrowed by the PATCH
 *  decision path (the notice recipients read the same fields). */
export const applicantMiniSelect = {
  id: true,
  firstName: true,
  lastName: true,
  emailAddress: true,
  mobileNumber: true,
  contactNumber: true,
  gender: true,
  isProfileComplete: true,
} as const;

export type ApplicantMiniRow = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string | null;
  mobileNumber: string | null;
  contactNumber: string | null;
  gender: string | null;
  isProfileComplete: boolean;
};

/** Load + assemble the full Review Dossier: frozen snapshots, live
 *  requirements report, MOM re-apply history, supporting documents. Throws
 *  the route's 404 for unknown ids. */
export async function readDossier(applicationId: number): Promise<ReviewDossier> {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    include: {
      job: { include: { position: true } },
      applicant: { select: applicantMiniSelect },
    },
  });
  if (!app) throw new ApiError("Application not found", 404);

  const position = app.job.position;
  const snapshots = parseReviewSnapshots(app);

  // Uploaded supporting documents (live document store, newest first) so the
  // review workspace dossier Documents tab can show + preview them.
  const documents = await db.document.findMany({
    where: { applicantId: app.applicantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      filePath: true,
      category: true,
      status: true,
      createdAt: true,
    },
  });

  const priorRejections = await reApplyHistory(app.applicantId, app.jobId, app.id);

  return {
    id: app.id,
    status: app.status,
    reason: app.reason,
    dateApplied: app.dateApplied.toISOString(),
    applicantId: app.applicantId,
    jobId: app.jobId,
    job: {
      ...app.job,
      title: position?.positionTitle || app.job.title,
      position,
    },
    applicant: app.applicant,
    snapshots: {
      ...snapshots,
      documents: documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    },
    requirements: requirementsReportFor(snapshots, position),
    priorRejections,
    interviews: [],
    examinations: [],
    statusChanges: [],
  };
}
