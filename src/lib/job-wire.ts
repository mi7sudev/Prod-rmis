// ============================================================================
// RMIS — Job posting wire shape (spec §6.2). ONE toJobWire for every surface
// that ships a JobPosting to the client (was duplicated verbatim in
// jobs/route.ts and jobs/[id]/route.ts — ~45 lines that could drift).
// Server-side only (Prisma types + Date math).
// ============================================================================

import { Prisma } from "@prisma/client";
import { jobIsActive } from "@/lib/job-meta";

export function toDateTime(v: string | null | undefined): Date | null {
  return v ? new Date(v) : null;
}

export const jobInclude = {
  position: true,
  author: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { applications: true } },
} satisfies Prisma.JobPostingInclude;

export type JobRow = Prisma.JobPostingGetPayload<{ include: typeof jobInclude }>;

export function toJobWire(job: JobRow, ownApplications: { id: number; status: string }[]) {
  return {
    id: job.id,
    title: job.position?.positionTitle || job.title,
    positionType: job.positionType,
    numberOfVacancy: job.numberOfVacancy,
    status: job.status as "PENDING" | "PUBLISHED",
    briefDescription: job.briefDescription,
    briefDescriptionHtml: job.briefDescriptionHtml,
    compensationPackage: job.compensationPackage,
    compensationHtml: job.compensationHtml,
    otherQualifications: job.otherQualifications,
    otherQualificationsHtml: job.otherQualificationsHtml,
    publishDate: job.publishDate?.toISOString() ?? null,
    deadlineDate: job.deadlineDate?.toISOString() ?? null,
    processingDate: job.processingDate?.toISOString() ?? null,
    publishedAt: job.publishedAt.toISOString(),
    isActive: jobIsActive(job.deadlineDate),
    position: job.position ?? null,
    author: job.author,
    applications: ownApplications,
    applicationCount: job._count.applications,
  };
}
