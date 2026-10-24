// ============================================================================
// RMIS — Work experience section CRUD (spec §6.3, §5.3). APPLICANT-only.
// POST computes yearDecimal (MQR denominator): derived from inclusive dates
// with 365.25-day years; open-ended (isPresentWork or missing dateTo) counts
// to today. GET = own rows ordered ord asc. No PUT (edit = delete + recreate).
// ============================================================================

import { ok, handleApi, requireEntryContent } from "@/lib/api";
import { requireApplicantProfileAccess } from "@/lib/role-policy";
import { db } from "@/lib/db";
import { workExperienceSchema, orNull } from "@/lib/validation";

import { toDate, computeYearDecimal } from "@/lib/dates";

export const GET = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantProfileAccess(req, "applicant/work-experiences", "GET");
  const rows = await db.workExperience.findMany({ where: { applicantId: applicant.id }, orderBy: { ord: "asc" } });
  return ok(rows);
});

export const POST = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantProfileAccess(req, "applicant/work-experiences", "POST");
  const body = workExperienceSchema.parse(await req.json().catch(() => ({})));

  const isPresent = body.isPresentWork === true;
  const dateFrom = toDate(body.dateFrom);
  const dateTo = toDate(body.dateTo);

  // Blank rows never become rows (they used to satisfy the apply gate).
  requireEntryContent("work experience entry", {
    positionTitle: orNull(body.positionTitle),
    employerName: orNull(body.employerName),
    employerAddress: orNull(body.employerAddress),
    dateFrom,
    dateTo,
    statusOfEmployment: orNull(body.statusOfEmployment),
    monthlySalary: body.monthlySalary ?? null,
    supervisorName: orNull(body.supervisorName),
    supervisorPosition: orNull(body.supervisorPosition),
    office: orNull(body.office),
    reasonForLeaving: orNull(body.reasonForLeaving),
    accomplishment: orNull(body.accomplishment),
    actualDuties: orNull(body.actualDuties),
  });

  const row = await db.workExperience.create({
    data: {
      applicantId: applicant.id,
      positionTitle: orNull(body.positionTitle),
      employerName: orNull(body.employerName),
      employerAddress: orNull(body.employerAddress),
      isPresentWork: isPresent,
      isGovtService: body.isGovtService === true,
      dateFrom,
      dateTo,
      statusOfEmployment: orNull(body.statusOfEmployment),
      monthlySalary: body.monthlySalary ?? null,
      supervisorName: orNull(body.supervisorName),
      supervisorPosition: orNull(body.supervisorPosition),
      office: orNull(body.office),
      reasonForLeaving: orNull(body.reasonForLeaving),
      accomplishment: orNull(body.accomplishment),
      actualDuties: orNull(body.actualDuties),
      hrRemarks: orNull(body.hrRemarks),
      yearDecimal: computeYearDecimal(dateFrom, dateTo, isPresent),
      ord: Date.now(),
    },
  });

  return ok(row, 201);
});
