// ============================================================================
// RMIS — The Pipeline Board seam (client). ONE wire type + ONE queue fetch +
// ONE stage-bucket factory for every staff surface that browses the
// application pipeline: the review queue (§7.8), the job workspace (§7.10),
// the candidate registry (§7.11) and analytics (§7.13). The server producer
// is /api/evaluator/queue; this module is its single client seam, so a new
// pipeline column lands HERE once and every board sees it (architecture
// candidate ④ — was four hand-redeclared QueueRow types + triplicated bucket
// initialization).
// Presentation vocabulary stays in its home modules — stages/stage mapping
// in lib/status.ts, glyphs/variants in lib/status-ui.ts. Nothing about those
// is re-declared here.
// ============================================================================

import { apiFetch } from "@/lib/client";
import { stageForStatus, type StageKey } from "@/lib/status";

/**
 * Wire row of GET /api/evaluator/queue — the ONLY client definition (was
 * hand-redeclared, with drifting widths, in four staff views). `applicant` /
 * `job` mirror the route's select/include shape; `priorRejections` is the
 * MOM 2026-10-13 per-(applicant, job) re-application aid, absent or null
 * when the pair has none.
 */
export type QueueRow = {
  id: number;
  status: string;
  stage: StageKey;
  reason: string | null;
  dateApplied: string;
  applicantId: number;
  jobId: number;
  applicant: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    emailAddress: string | null;
    contactNumber: string | null;
    gender: string | null;
    isProfileComplete: boolean;
  };
  job: {
    id: number;
    title: string;
    position: { positionTitle: string; division: string | null } | null;
  };
  match: { verdict: string; metCount: number; requiredCount: number };
  tags: string[];
  /** MOM 2026-10-13 — prior rejected applications for THIS job listing. */
  priorRejections?: { count: number; lastDate: string | null; lastReason: string | null } | null;
};

/** The full pipeline queue (staff views paginate/filter client-side; cap 1000). */
export async function fetchQueue(): Promise<QueueRow[]> {
  const res = await apiFetch<{ data: QueueRow[] }>("/api/evaluator/queue?pageSize=1000");
  return res.data;
}

/**
 * The ONE pipeline-bucket init (was written out three times: review queue,
 * job workspace, candidate registry). Every row lands in exactly one stage
 * bucket via the canonical stageForStatus mapping, in PIPELINE_STAGES order.
 */
export function bucketByStage(rows: readonly QueueRow[]): Record<StageKey, QueueRow[]> {
  const map: Record<StageKey, QueueRow[]> = {
    "Applied": [],
    "Under Review": [],
    "Shortlisted": [],
    "Rejected": [],
  };
  for (const r of rows) map[stageForStatus(r.status)].push(r);
  return map;
}
