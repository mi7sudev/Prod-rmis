// ============================================================================
// RMIS — Review Dossier wire types (client-safe). The ONE contract for what
// an Evaluator judges an Applicant by: served by GET
// /api/evaluator/applications/[id] (the full dossier) and GET
// /api/evaluator/queue (per-row match + prior-rejection history), consumed by
// the review workspace. Shared instead of re-declared — architecture
// candidates ① + ② (2026-10-22). Types only, no runtime imports, so client
// components import this module directly; the assembling server module is
// lib/review-dossier.ts.
// ============================================================================

import type { RequirementsReport } from "@/lib/requirements";

/** A frozen snapshot row (§8.8) is schemaless JSON on the wire — review
 *  surfaces read known projections off it (lib/requirements engine,
 *  lib/credential-tag). */
export type ReviewSnapshotRow = Record<string, unknown>;

/** MOM 2026-10-13 — the applicant's prior REJECTED/DECLINED applications for
 *  the SAME job posting. WITHDRAWN never counts (the applicant's own action,
 *  not a rejection verdict) and the current application never counts (a
 *  rejection must not become its own history). Null when there is none. */
export type PriorRejections = {
  count: number;
  lastDate: string | null;
  lastReason: string | null;
};

/** Supporting document row embedded in the dossier snapshots (the live
 *  document store, newest first — display + preview only). */
export type ReviewDocumentRow = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  filePath: string;
  category: string;
  status: string;
  createdAt: string;
};

/** The frozen snapshot set every review surface reads (§8.8). */
export type ReviewSnapshotSet = {
  profile: ReviewSnapshotRow | null;
  educations: ReviewSnapshotRow[];
  experiences: ReviewSnapshotRow[];
  trainings: ReviewSnapshotRow[];
  eligibilities: ReviewSnapshotRow[];
  awards: ReviewSnapshotRow[];
};

/** Applicant projection carried by the detail dossier. */
export type ReviewDossierApplicant = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string | null;
  mobileNumber: string | null;
  contactNumber: string | null;
  gender: string | null;
  isProfileComplete: boolean;
};

/** Position projection carried by the detail dossier (the full Position row
 *  rides along on the wire; these are the fields the review UI reads). */
export type ReviewDossierPosition = {
  positionTitle: string;
  division: string | null;
  itemNumber: string | null;
};

/** GET /api/evaluator/applications/[id] — the full Review Dossier. */
export type ReviewDossier = {
  id: number;
  status: string;
  reason: string | null;
  dateApplied: string;
  applicantId: number;
  jobId: number;
  job: {
    id: number;
    title: string;
    positionType: string | null;
    position: ReviewDossierPosition | null;
  };
  applicant: ReviewDossierApplicant;
  snapshots: ReviewSnapshotSet & { documents: ReviewDocumentRow[] };
  requirements: RequirementsReport;
  priorRejections: PriorRejections | null;
  interviews: unknown[];
  examinations: unknown[];
  statusChanges: unknown[];
};

/** Queue-row MQR headline — the requirements report's top line (the full
 *  checks list lives in the detail dossier). */
export type ReviewMatchSummary = {
  verdict: RequirementsReport["verdict"];
  metCount: number;
  requiredCount: number;
};
