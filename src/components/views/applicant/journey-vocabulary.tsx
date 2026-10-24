"use client";

// ============================================================================
// RMIS — The Application Journey Vocabulary (architecture candidate ⑥, the
// operator-approved decomposition of the 1,839-line applicant-home.tsx).
// The ONE applicant-facing stage vocabulary: maps an application's stored
// status → journey label, hue, glyphs, step progress and per-stage behavior
// for every §7.3 surface (the journey cards' stepper, the history-drawer
// timeline, the §7.7 detail-modal chips, the tracker pills).
//
// SINGLE SOURCE — this module RE-USES the system vocabulary, it never
// re-declares a stage mapping:
//   · lib/status.ts    — stageForStatus (canonical pipeline grouping of ANY
//     stored spelling) and currentStageLabel (spec §7.3 applicant labels:
//     Submitted / In Review / Shortlisted / Not Selected).
//   · lib/status-ui.ts — APPLICANT_STAGE_VARIANT (journey label → functional
//     hue) shared with the board badges and tracker chips. Staff surfaces
//     additionally speak STAGE_GLYPH; the applicant journey's own glyph
//     language is the c-stepper-7 template set below (SendHorizontal /
//     SearchCheck / Clock) plus the decision override (decisionViz) — all
//     keyed off the SAME StageKey, so hue, glyph and behavior can never
//     drift from the pipeline vocabulary the staff side speaks.
// UI-only: pure mapping functions — no fetching, no state, no layout.
// ============================================================================

import type { ReactNode } from "react";
import { Clock, SearchCheck, SendHorizontal, Star, X } from "lucide-react";
import { currentStageLabel, stageForStatus, type StageKey } from "@/lib/status";
import { APPLICANT_STAGE_VARIANT, type StatusVariant } from "@/lib/status-ui";

/** Applicant-facing stage label → functional status variant (§2 status system).
 *  Shared mapping from lib/status-ui — the applicant timeline, tracker chips
 *  and board badges all agree on hue AND glyph. */
export function stageVariant(label: string): StatusVariant {
  return APPLICANT_STAGE_VARIANT[label] ?? "neutral";
}

/** Functional variant → the reui Badge light family the journey cards'
 *  header status pill wears (the one Badge the applicant portal tracks
 *  stages with — bold pill, syncing spinner while In Review). */
export function journeyBadgeVariant(variant: StatusVariant) {
  return variant === "ok"
    ? "success-light"
    : variant === "warn"
      ? "warning-light"
      : variant === "bad"
        ? "destructive-light"
        : variant === "info"
          ? "info-light"
          : "secondary-light";
}

// ── The §7.3 progression law ────────────────────────────────────────────────
// The journey reads as three steps — Submitted → Under Review → Decision —
// and an application "reaches" a step purely through its pipeline stage:
// Applied sits at step 1, anything in the Under Review family at step 2, and
// a decided stage (Shortlisted / Rejected) has finished step 3. Both journey
// renderers (the cards' c-stepper-7 and the drawer's c-timeline-3) derive
// their controlled value from THIS function, so the two can never disagree
// about how far an application has gotten.

export type JourneyProgress = {
  /** Canonical pipeline stage (lib/status.ts stageForStatus). */
  stage: StageKey;
  /** §7.3 applicant-facing label (Submitted / In Review / Shortlisted / Not Selected). */
  label: string;
  /** The step the application has reached: 1 = Submitted, 2 = Under Review,
   *  3 = Decision (reached = the decided step is complete). */
  reached: 1 | 2 | 3;
  decided: boolean;
  reviewing: boolean;
};

export function journeyProgress(status: string): JourneyProgress {
  const stage = stageForStatus(status);
  const decided = stage === "Shortlisted" || stage === "Rejected";
  const reviewing = stage === "Under Review";
  return {
    stage,
    label: currentStageLabel(status),
    reached: decided ? 3 : reviewing ? 2 : 1,
    decided,
    reviewing,
  };
}

/** The decision step's neutral title — never presumes the shortlist outcome,
 *  since the decision can go either way; once decided, the outcome becomes
 *  the title. Shared by the stepper and the timeline (was duplicated inline
 *  twice, audit 2026-10-22 dedup). */
export function decisionStepTitle(stage: StageKey): string {
  if (stage === "Shortlisted") return "Shortlisted";
  if (stage === "Rejected") return "Not Shortlisted";
  return "Awaiting Decision";
}

/** The c-stepper-7 step icons (Task 51 — user-supplied template contents
 *  remapped to our pipeline, not numerals): the paper-plane submission, the
 *  inspection read, the waiting clock. The decision override still swaps the
 *  clock for the ok star / bad × at render time (decisionViz). */
export function journeySteps(stage: StageKey): { title: string; icon: ReactNode }[] {
  return [
    {
      title: "Submitted",
      icon: <SendHorizontal aria-hidden="true" className="size-3.5 sm:size-4" />,
    },
    {
      title: "Under Review",
      icon: <SearchCheck aria-hidden="true" className="size-3.5 sm:size-4" />,
    },
    {
      title: decisionStepTitle(stage),
      icon: <Clock aria-hidden="true" className="size-3.5 sm:size-4" />,
    },
  ];
}

/** Decision step glyphs — the ok/bad override shared by the compact journey
 *  cards and the full timeline (was duplicated inline twice, audit 2026-10-22
 *  dedup). Keyed off the canonical StageKey: Shortlisted paints the filled
 *  ok star, Rejected the bold bad ×, on the system's --ok/--bad tints
 *  (Rejected must never read as progress). Aligned with the STAGE_VARIANT
 *  ok/bad hues the status chips wear for the same stages. */
export function decisionViz(stage: string, size: "sm" | "base"): { glyph: ReactNode; color?: string } {
  if (stage === "Shortlisted") {
    return {
      glyph: (
        <Star
          aria-hidden="true"
          className={size === "sm" ? "size-3 fill-current sm:size-3.5" : "size-3.5 fill-current"}
          strokeWidth={0}
        />
      ),
      color: "var(--ok)",
    };
  }
  if (stage === "Rejected") {
    return {
      glyph: (
        <X
          aria-hidden="true"
          className={size === "sm" ? "size-3 sm:size-3.5" : "size-3.5"}
          strokeWidth={3}
        />
      ),
      color: "var(--bad)",
    };
  }
  return { glyph: null, color: undefined };
}

// ── Per-stage behavior ──────────────────────────────────────────────────────

/** §7.3 Next Step hint paragraph per pipeline stage — the journey cards'
 *  closing block. */
export function nextStepHint(stage: StageKey): string {
  if (stage === "Rejected")
    return "Your application was not shortlisted. You may apply for other open positions.";
  if (stage === "Shortlisted")
    return "A notice has been sent to your registered email. HR will contact you for the next steps.";
  if (stage === "Under Review") return "HR is currently evaluating your application. You will be notified of the outcome.";
  return "Your application has been received and is awaiting evaluation by the Human Resource Office.";
}

/** True while HR still holds the application ("In Review") — the state that
 *  renders the syncing spinner/pulse on the journey badge and the tracker
 *  pill (the same convention documentStatusMeta uses for PROCESSING). */
export function journeyInReview(label: string): boolean {
  return label === "In Review";
}

/** §7.7 — Cancel Application is offered only while the application is still
 *  plain Submitted; once review has started it can no longer be cancelled. */
export function journeyCancellable(label: string): boolean {
  return label === "Submitted";
}
