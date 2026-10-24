// ============================================================================
// RMIS — Single job posting (spec §6.2).
//   PATCH  staff — partial update; positionId present → set (null unlinks);
//                  vitals present → update-or-create the linked Position.
//                  No audit on update.
//   DELETE staff — confirm gate: linked applications require ?scope=all;
//                  cascade deletes applications + snapshots + posting.
// ============================================================================

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, ApiError, handleApi, getClientIp, parseId } from "@/lib/api";
import type { AuthedUser } from "@/lib/auth";
import { requireRouteAccess } from "@/lib/role-policy";
import { jobCreateSchema } from "@/lib/validation";
import { sanitizeHtml } from "@/lib/sanitize";
import { auditLog, userLabelOf } from "@/lib/audit";
import { toDateTime, jobInclude, toJobWire } from "@/lib/job-wire";

// ── Local helpers ───────────────────────────────────────────────────────────

function auditStaff(user: AuthedUser, req: Request, action: string, entityId: number, description: string) {
  auditLog({
    userId: user.id,
    userLabel: userLabelOf(user),
    userRole: user.role,
    action,
    entityType: "job",
    entityId,
    description,
    ipAddress: getClientIp(req),
  });
}

// ── PATCH /api/jobs/[id] — partial update ───────────────────────────────────

export const PATCH = handleApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireRouteAccess(req, "jobs/[id]", "PATCH");
  const id = parseId((await ctx.params).id);

  const job = await db.jobPosting.findUnique({ where: { id }, include: { position: true } });
  if (!job) throw new ApiError("Job posting not found", 404);

  const body = await req.json().catch(() => ({}));
  const input = jobCreateSchema.partial().parse(body);

  // NOTE: in this Zod version .partial() still applies .default(1) to
  // numberOfVacancy — guard on raw-body presence so an omitted field is
  // never "updated" to the default.
  const vacancyProvided =
    body && typeof body === "object" && "numberOfVacancy" in (body as Record<string, unknown>);

  const data: Prisma.JobPostingUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.positionType !== undefined) data.positionType = input.positionType;
  if (vacancyProvided && input.numberOfVacancy !== undefined) data.numberOfVacancy = input.numberOfVacancy;
  if (input.briefDescription !== undefined) data.briefDescription = input.briefDescription;
  if (input.briefDescriptionHtml !== undefined) data.briefDescriptionHtml = sanitizeHtml(input.briefDescriptionHtml) || null;
  if (input.compensationPackage !== undefined) data.compensationPackage = input.compensationPackage;
  if (input.compensationHtml !== undefined) data.compensationHtml = sanitizeHtml(input.compensationHtml) || null;
  if (input.otherQualifications !== undefined) data.otherQualifications = input.otherQualifications;
  if (input.otherQualificationsHtml !== undefined) data.otherQualificationsHtml = sanitizeHtml(input.otherQualificationsHtml) || null;
  if (input.publishDate !== undefined) data.publishDate = toDateTime(input.publishDate);
  if (input.deadlineDate !== undefined) data.deadlineDate = toDateTime(input.deadlineDate);
  if (input.processingDate !== undefined) data.processingDate = toDateTime(input.processingDate);
  if (input.positionId !== undefined) data.positionId = input.positionId;
  // Publication state — the recruitment table's Pending/Published dropdown
  // PATCHes this key to flip a Save-as-later draft onto the board (or back).
  if (input.status !== undefined) data.status = input.status;

  // Vitals write-through (spec §6.2): update the linked position — or create
  // one when none is linked. Only fields actually provided are written.
  const vitals: Prisma.PositionUpdateInput = {};
  if (input.education !== undefined) vitals.cscEducation = input.education;
  if (input.experience !== undefined) vitals.cscWorkExperience = input.experience;
  if (input.training !== undefined) vitals.cscTraining = input.training;
  if (input.eligibility !== undefined) vitals.cscEligibilityGroup = input.eligibility;
  if (input.license !== undefined) vitals.license = input.license;
  if (input.division !== undefined) vitals.division = input.division;
  if (input.section !== undefined) vitals.section = input.section;
  // QA 2026-02 — posting identity vitals (Item No., Salary Grade, Monthly
  // Salary) ride the same provided-only write-through. Task 10 — Salary Step
  // joins them. (Task 24 — Place of Assignment retired system-wide.)
  if (input.itemNumber !== undefined) vitals.itemNumber = input.itemNumber;
  if (input.salaryGrade !== undefined) vitals.salaryGrade = input.salaryGrade;
  if (input.salaryStep !== undefined) vitals.salaryStep = input.salaryStep;
  if (input.salaryAmount !== undefined) vitals.salaryAmount = input.salaryAmount;
  // Task 25 — Key Competency rich-editor HTML, sanitized at the door. Task 70
  // — cleared fields arrive as explicit null (the frontend no longer drops
  // them), and null here is the "clear the column" write.
  if (input.keyCompetency !== undefined)
    vitals.keyCompetency = input.keyCompetency ? sanitizeHtml(input.keyCompetency) : null;
  const hasVitals = Object.keys(vitals).length > 0;
  // Task 70 — nulls are now routine in `vitals`. A job with NO linked position
  // whose vitals are all null has nothing to create: writing an empty Position
  // row (and linking it) would be pure debris. Clearing columns on an EXISTING
  // linked position still runs — that is the deletion path this task fixes.
  const vitalsMeaningful = Object.values(vitals).some((v) => v != null && v !== "");

  if (hasVitals) {
    const targetId = input.positionId !== undefined ? input.positionId : job.positionId;
    if (targetId != null) {
      const target = await db.position.findUnique({ where: { id: targetId } });
      if (!target) throw new ApiError("Linked position not found", 404);
      await db.position.update({ where: { id: targetId }, data: vitals });
    } else if (vitalsMeaningful) {
      const created = await db.position.create({
        data: {
          positionTitle: input.title ?? job.title,
          positionType: input.positionType ?? job.positionType,
          cscEducation: input.education ?? null,
          cscWorkExperience: input.experience ?? null,
          cscTraining: input.training ?? null,
          cscEligibilityGroup: input.eligibility ?? null,
          license: input.license ?? null,
          division: input.division ?? null,
          section: input.section ?? null,
          itemNumber: input.itemNumber ?? null,
          salaryGrade: input.salaryGrade ?? null,
          salaryStep: input.salaryStep ?? null,
          salaryAmount: input.salaryAmount ?? null,
          keyCompetency: input.keyCompetency ? sanitizeHtml(input.keyCompetency) : null,
        },
      });
      data.positionId = created.id;
    }
  }

  const updated = await db.jobPosting.update({ where: { id }, data, include: jobInclude });
  return ok(toJobWire(updated, []));
});

// ── DELETE /api/jobs/[id] — confirm-gated cascade delete ────────────────────

export const DELETE = handleApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireRouteAccess(req, "jobs/[id]", "DELETE");
  const id = parseId((await ctx.params).id);
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope");

  const job = await db.jobPosting.findUnique({
    where: { id },
    include: { _count: { select: { applications: true } } },
  });
  if (!job) throw new ApiError("Job posting not found", 404);

  const applicationCount = job._count.applications;

  // Confirm gate (spec §6.2): linked applications require an explicit scope.
  if (applicationCount > 0 && scope !== "all") {
    throw new ApiError(
      "This posting has linked applications. Confirm deletion to remove them as well.",
      409,
      { applicationCount }
    );
  }

  if (applicationCount > 0) {
    // Atomic cascade: applications and the posting disappear together. Two
    // bare deletes could strand applications under a deleted posting if the
    // second write failed.
    await db.$transaction(async (tx) => {
      await tx.application.deleteMany({ where: { jobId: id } });
      await tx.jobPosting.delete({ where: { id } });
    });
  } else {
    await db.jobPosting.delete({ where: { id } });
  }

  auditStaff(
    user,
    req,
    "JOB_POSTING_DELETED",
    id,
    `Job posting deleted: ${job.title}` + (applicationCount > 0 ? ` (including ${applicationCount} linked application${applicationCount === 1 ? "" : "s"} with their snapshots)` : "")
  );

  return ok({ id, deleted: true, applicationsDeleted: applicationCount });
});
