// ============================================================================
// RMIS — MQR evaluation engine (spec §8.1). Binary pass/fail per dimension;
// MOM-mandated verdict strings; enforced server-side at apply; never persisted.
//
// System audit (2026-10-22): the applicant gate and the reviewer-side
// requirements report previously ran TWO different education engines (a loose
// token-threshold rule here vs clause+level parsing in lib/requirements), so
// an applicant could pass the apply gate on a standard their reviewer ledger
// flagged NOT_MET. There is now ONE engine: verifyMqr maps
// buildRequirementsReport (lib/requirements — clause-level education parsing,
// rank-based CSC eligibility matching, quantity checks) onto the binary MQR
// verdicts. REVIEW verdicts (ambiguous standards) pass the gate and stay
// flagged for manual verification in the ledger — an applicant is never
// blocked on an unparseable requirement.
// ============================================================================

import {
  buildRequirementsReport,
  type RequirementCheck,
  type SnapshotShape,
} from "@/lib/requirements";

export type MqrResult = {
  education: string;
  eligibility: string;
  workExperience: string;
  training: string;
};

export type MqrInput = {
  education: {
    educationLevel?: string | null;
    course?: string | null;
    specifyOthers?: string | null;
    degree?: string | null;
    schoolName?: string | null;
    ongoing?: boolean | null;
    yearGraduated?: string | null;
  }[];
  eligibilities: { title?: string | null; rating?: string | null }[];
  workExperiences: { yearDecimal?: number | null }[];
  trainings: { hourDecimal?: number | null; numberHours?: number | null }[];
};

export type MqrPosition = {
  cscEducation?: string | null;
  cscEligibility?: string | null;
  cscEligibilityGroup?: string | null;
  cscWorkExperience?: string | null;
  cscTraining?: string | null;
};

export const MQR_MEETS = "Meets the minimum requirements";
export const MQR_FAILS = "Does not meet the minimum requirements";

export function verifyMqr(applicant: MqrInput, position: MqrPosition): MqrResult {
  const snapshot: SnapshotShape = {
    educations: applicant.education.map((e) => ({
      educationLevel: e.educationLevel ?? null,
      degree: e.degree ?? null,
      course: e.course ?? null,
      specifyOthers: e.specifyOthers ?? null,
      schoolName: e.schoolName ?? null,
      ongoing: e.ongoing ?? null,
      yearGraduated: e.yearGraduated ?? null,
    })),
    experiences: applicant.workExperiences,
    trainings: applicant.trainings,
    eligibilities: applicant.eligibilities,
  };
  const report = buildRequirementsReport(snapshot, position);

  const verdictFor = (dimension: RequirementCheck["dimension"]): string => {
    const check = report.checks.find((c) => c.dimension === dimension);
    // No check / NOT_REQUIRED → trivially met; REVIEW (ambiguous standard) →
    // pass the gate, the reviewer ledger flags it for manual verification.
    if (!check) return MQR_MEETS;
    return check.status === "NOT_MET" ? MQR_FAILS : MQR_MEETS;
  };

  return {
    education: verdictFor("education"),
    eligibility: verdictFor("eligibility"),
    workExperience: verdictFor("experience"),
    training: verdictFor("training"),
  };
}

export function allMet(results: MqrResult): boolean {
  return Object.values(results).every((v) => v === MQR_MEETS);
}

export function mqrDiagnostics(label: string, verdict: string, detail?: string): string {
  return verdict === MQR_MEETS ? `${label}: ${verdict}` : `${label}: ${verdict}${detail ? ` (${detail})` : ""}`;
}
