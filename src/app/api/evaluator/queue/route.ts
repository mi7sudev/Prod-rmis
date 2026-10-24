// ============================================================================
// RMIS — Evaluator review queue (spec §6.5, §7.8). FIFO by dateApplied asc,
// paginated. ?status filters via the stage vocabulary (invalid/absent = ALL).
// Per-row requirements match is computed LIVE from the frozen snapshots vs
// the live Position CSC standards (§8.2) — never persisted. Snapshot
// deserialization, the requirements report and the MOM 2026-10-13
// prior-rejection history come from the shared Review Dossier module
// (lib/review-dossier).
// ============================================================================

import { db } from "@/lib/db";
import { ok, handleApi } from "@/lib/api";
import { requireRouteAccess } from "@/lib/role-policy";
import { stageForStatus, QUERYABLE_STATUSES, normStatus } from "@/lib/status";
import {
  buildReApplyIndex,
  parseReviewSnapshots,
  reApplyFromIndex,
  requirementsReportFor,
  requirementsShapeFor,
} from "@/lib/review-dossier";
import { credentialTagFor } from "@/lib/credential-tag";
import { paginationSchema } from "@/lib/validation";

export const GET = handleApi(async (req: Request) => {
  await requireRouteAccess(req, "evaluator/queue", "GET");

  const { searchParams } = new URL(req.url);
  const { page, pageSize } = paginationSchema.parse({
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });

  const statusParam = searchParams.get("status");
  const statusFilter =
    statusParam && QUERYABLE_STATUSES.includes(statusParam) ? statusParam : null;

  // Datasets are small — fetch all and compute + paginate in memory.
  const rows = await db.application.findMany({
    orderBy: { dateApplied: "asc" },
    include: {
      applicant: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          emailAddress: true,
          contactNumber: true,
          gender: true,
          isProfileComplete: true,
        },
      },
      job: { include: { position: true } },
    },
  });

  const filtered = statusFilter
    ? rows.filter(
        (r) =>
          normStatus(r.status) === normStatus(statusFilter) ||
          stageForStatus(r.status) === stageForStatus(statusFilter)
      )
    : rows;

  // MOM 2026-10-13 — prior-rejection history per (applicant, job) pair, so
  // evaluators see when an applicant has applied before and was rejected for
  // THIS specific job listing (repost/republication review aid). ONE doctrine
  // (lib/review-dossier — same rule as the detail dossier): REJECTED/DECLINED
  // rows for the pair with the current row itself excluded by id, WITHDRAWN
  // never counted. Indexed from the same row set — no extra queries.
  const reApplyIndex = buildReApplyIndex(rows);

  const data = filtered.map((app) => {
    const position = app.job.position;
    const snapshots = parseReviewSnapshots(app);
    const report = requirementsReportFor(snapshots, position);
    // Display-only credential tag (frozen snapshot — never live data).
    // ONE tag per card: education, else training, else eligibility.
    const tag = credentialTagFor(requirementsShapeFor(snapshots));
    const tags = tag ? [tag] : [];
    return {
      id: app.id,
      status: app.status,
      stage: stageForStatus(app.status),
      reason: app.reason,
      dateApplied: app.dateApplied.toISOString(),
      applicantId: app.applicantId,
      jobId: app.jobId,
      applicant: app.applicant,
      job: {
        id: app.job.id,
        title: position?.positionTitle || app.job.title,
        position: position
          ? { positionTitle: position.positionTitle, division: position.division }
          : null,
      },
      match: { verdict: report.verdict, metCount: report.metCount, requiredCount: report.requiredCount },
      tags,
      priorRejections: reApplyFromIndex(reApplyIndex, app.applicantId, app.jobId, app.id),
    };
  });

  const total = data.length;
  const start = (page - 1) * pageSize;
  const slice = data.slice(start, start + pageSize);
  const hasMore = start + slice.length < total;

  return ok({ data: slice, total, page, pageSize, hasMore });
});
