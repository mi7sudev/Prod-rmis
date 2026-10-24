// ============================================================================
// RMIS — Jobs collection (spec §6.2).
//   GET  public  — published postings, newest first, deadline-visibility rule
//                  (§8.7: non-staff viewers never see postings whose deadline
//                  date is before start-of-today, nor PENDING ones — the
//                  Save-as-later drafts are a staff-only workspace fact).
//   POST  staff  — create (Create & publish → PUBLISHED, Save as later →
//                  PENDING); HTML companions sanitized; qualification vitals
//                  written through to the linked Position (update) or used to
//                  create a new Position when none linked.
// ============================================================================

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, ApiError, handleApi, getClientIp } from "@/lib/api";
import { getSessionFromReq } from "@/lib/auth";
import { requireRouteAccess } from "@/lib/role-policy";
import { jobIsActive } from "@/lib/job-meta";
import { jobCreateSchema } from "@/lib/validation";
import { sanitizeHtml } from "@/lib/sanitize";
import { auditLog } from "@/lib/audit";
import { toDateTime, jobInclude, toJobWire, type JobRow } from "@/lib/job-wire";

// ── Local helpers ───────────────────────────────────────────────────────────

/** Qualification vitals carried on the job form (write-through to Position). */
function positionVitals(input: {
  education?: string | null;
  experience?: string | null;
  training?: string | null;
  eligibility?: string | null;
  license?: string | null;
  division?: string | null;
  section?: string | null;
  itemNumber?: string | null;
  salaryGrade?: string | null;
  // Task 10 — the remaining front-page identity fact rides the same
  // write-through so the public board renders it straight from the form.
  // (Task 24 — Place of Assignment retired system-wide.)
  salaryStep?: string | null;
  salaryAmount?: number | null;
  // Task 25 — Key Competency rich-editor HTML rides the same write-through;
  // sanitized server-side (spec §12.4) at this single choke point.
  keyCompetency?: string | null;
}) {
  return {
    cscEducation: input.education ?? null,
    cscWorkExperience: input.experience ?? null,
    cscTraining: input.training ?? null,
    cscEligibilityGroup: input.eligibility ?? null,
    license: input.license ?? null,
    division: input.division ?? null,
    section: input.section ?? null,
    // QA 2026-02 — the posting identity vitals (Item No., Salary Grade,
    // Monthly Salary) ride the same write-through so the public board's
    // quick facts and every table render them.
    itemNumber: input.itemNumber ?? null,
    salaryGrade: input.salaryGrade ?? null,
    salaryStep: input.salaryStep ?? null,
    salaryAmount: input.salaryAmount ?? null,
    keyCompetency: input.keyCompetency ? sanitizeHtml(input.keyCompetency) || null : null,
  };
}

function hasVitals(input: {
  education?: string | null;
  experience?: string | null;
  training?: string | null;
  eligibility?: string | null;
  license?: string | null;
  division?: string | null;
  section?: string | null;
  itemNumber?: string | null;
  salaryGrade?: string | null;
  salaryStep?: string | null;
  salaryAmount?: number | null;
  keyCompetency?: string | null;
}): boolean {
  return [input.education, input.experience, input.training, input.eligibility, input.license, input.division, input.section, input.itemNumber, input.salaryGrade, input.salaryStep]
    .some((v) => typeof v === "string" && v.trim() !== "") || input.salaryAmount != null || !!input.keyCompetency?.trim();
}

// ── GET /api/jobs — public listing ──────────────────────────────────────────

export const GET = handleApi(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const rawLimit = Number(searchParams.get("limit"));
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 100, 1), 200);

  // Session is optional — used only to personalize (own applications) and to
  // decide the deadline-visibility tier (staff see everything, §8.7).
  const session = await getSessionFromReq(req);
  const isStaff = session?.role === "EVALUATOR" || session?.role === "ADMIN";

  const jobs = await db.jobPosting.findMany({
    // publishedAt is non-nullable (@default(now())) — gte(epoch) expresses the
    // "published only" filter in a way Prisma's DateTimeFilter accepts.
    where: { publishedAt: { gte: new Date(0) } },
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: jobInclude,
  });

  // Deadline visibility rule (spec §8.7): hide from non-staff viewers any
  // posting whose deadline date is before start-of-today (date-level compare;
  // shared predicate from lib/job-meta). PENDING postings (Save as later)
  // are staff-only workspace facts — never on the public board.
  const visible = isStaff
    ? jobs
    : jobs.filter((j) => j.status === "PUBLISHED" && jobIsActive(j.deadlineDate));

  // Viewer's own applications (APPLICANT only) — keyed per job.
  const ownByJob = new Map<number, { id: number; status: string }[]>();
  if (session?.role === "APPLICANT" && session.applicantId != null && visible.length > 0) {
    const jobIds = visible.map((j) => j.id);
    const apps = await db.application.findMany({
      where: { applicantId: session.applicantId, jobId: { in: jobIds } },
      select: { id: true, status: true, jobId: true },
    });
    for (const a of apps) {
      const list = ownByJob.get(a.jobId) ?? [];
      list.push({ id: a.id, status: a.status });
      ownByJob.set(a.jobId, list);
    }
  }

  // Task 91 (user request) — the processing date is an internal HR scheduling
  // fact: null it for every non-staff viewer (public + APPLICANT) so the wire
  // never carries it past this door. Staff surfaces (job workspace record,
  // recruitment form) keep the real value — their requesters are ADMIN /
  // EVALUATOR sessions.
  return ok(
    visible.map((j) => {
      const wire = toJobWire(j, ownByJob.get(j.id) ?? []);
      if (!isStaff) wire.processingDate = null;
      return wire;
    })
  );
});

// ── POST /api/jobs — staff create + publish ─────────────────────────────────

export const POST = handleApi(async (req: Request) => {
  const user = await requireRouteAccess(req, "jobs", "POST");
  const body = await req.json().catch(() => ({}));
  const input = jobCreateSchema.parse(body);

  // QA 2026-02: contractual postings (Contract of Service and Job Order) must
  // carry a vacancy count — Plantilla posts are 1:1 with a Plantilla Item
  // Number, so their count is optional (null) and the ITEM NUMBER is required
  // instead whenever a Plantilla type is chosen.
  const typeUpper = (input.positionType ?? "").toUpperCase();
  const isCos =
    typeUpper.includes("COS") || typeUpper.includes("CONTRACT") || typeUpper.includes("JOB ORDER");
  if (isCos && (input.numberOfVacancy == null)) {
    throw new ApiError("Contract of Service / Job Order postings must specify the number of vacancies", 422);
  }
  if (!isCos && typeUpper !== "" && !input.itemNumber?.trim()) {
    throw new ApiError("Plantilla postings need the Plantilla Item No.", 422);
  }

  // HTML companions are sanitized server-side before storage (spec §12.4).
  const briefDescriptionHtml = sanitizeHtml(input.briefDescriptionHtml) || null;
  const compensationHtml = sanitizeHtml(input.compensationHtml) || null;
  const otherQualificationsHtml = sanitizeHtml(input.otherQualificationsHtml) || null;

  // Vitals write-through (spec §6.2): link an existing position (updating its
  // CSC standards) — or auto-create a Position when none was selected.
  let positionId = input.positionId ?? null;
  if (positionId != null) {
    const existing = await db.position.findUnique({ where: { id: positionId } });
    if (!existing) throw new ApiError("Linked position not found", 404);
    await db.position.update({ where: { id: positionId }, data: positionVitals(input) });
  } else if (hasVitals(input)) {
    const created = await db.position.create({
      data: {
        positionTitle: input.title,
        positionType: input.positionType ?? null,
        ...positionVitals(input),
      },
    });
    positionId = created.id;
  }

  const job = await db.jobPosting.create({
    data: {
      title: input.title,
      positionType: input.positionType ?? null,
      numberOfVacancy: input.numberOfVacancy ?? null,
      briefDescription: input.briefDescription ?? null,
      briefDescriptionHtml,
      compensationPackage: input.compensationPackage ?? null,
      compensationHtml,
      otherQualifications: input.otherQualifications ?? null,
      otherQualificationsHtml,
      publishDate: toDateTime(input.publishDate),
      deadlineDate: toDateTime(input.deadlineDate),
      processingDate: toDateTime(input.processingDate),
      positionId,
      authorId: user.id,
      publishedAt: new Date(),
      // Save as later → PENDING (hidden from the board until published from
      // the recruitment table); Create & publish / absent → PUBLISHED.
      status: input.status ?? "PUBLISHED",
    },
  });

  auditLog({
    userId: user.id,
    userLabel: `${user.username} (${user.email})`,
    userRole: user.role,
    action: "JOB_POSTING_CREATED",
    entityType: "job",
    entityId: job.id,
    description: `Job posting created${input.status === "PENDING" ? " (saved as pending)" : " and published"}: ${job.title}${positionId ? ` (position #${positionId})` : ""}`,
    ipAddress: getClientIp(req),
  });

  const fresh = await db.jobPosting.findUnique({ where: { id: job.id }, include: jobInclude });
  return ok(
    toJobWire(
      fresh ?? ({ ...job, position: null, author: null, _count: { applications: 0 } } as unknown as JobRow),
      []
    ),
    201
  );
});
