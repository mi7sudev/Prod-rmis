"use client";

// ============================================================================
// RMIS — Journey stepper (reui c-stepper-7 wired to the RMIS pipeline).
// Extracted verbatim from applicant-home.tsx (architecture candidate ⑥).
// Stage → label/glyph/behavior comes from the journey vocabulary module
// (applicant/journey-vocabulary), which re-uses lib/status + lib/status-ui.
// ============================================================================

import { CheckIcon, LoaderCircleIcon } from "lucide-react";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperTitle,
} from "@/components/reui/stepper";
import { Badge } from "@/components/reui/badge";
import { cn } from "@/lib/utils";
import { decisionViz, journeyProgress, journeySteps } from "@/components/views/applicant/journey-vocabulary";

/** The reui stepper port (@/components/reui/stepper) now running the
 *  c-stepper-7 block pattern (Task 51 — user supplied the template) for the
 *  §7.3 pipeline Submitted → Under Review → Decision. Each step is a
 *  LEFT-ALIGNED column, exactly the template's anatomy: an icon circle
 *  (24px phones / 32px sm+, border-2) over a "STEP N" eyebrow, a semibold
 *  title and a per-step state Badge — Completed (success-light) / In
 *  Progress (primary-light) / Pending (secondary-light); the decided step
 *  reads Completed too, success-light on a shortlist, secondary-light on a
 *  rejection (the outcome itself lives in the title + the card's header
 *  badge). Step icons speak our system: SendHorizontal (Submitted) ·
 *  SearchCheck (Under Review) · Clock (Awaiting Decision).
 *  HOUSE SEMANTICS KEEP THEIR SEATS: circles advance in brand blue (the
 *  template's green completed-success is a checkout metaphor), pending
 *  rails stay gray, the c-stepper-44 loading spinner still follows the live
 *  review step, and the decision override still paints the ok star / bad ×
 *  on their functional colors via the port's per-item `state` escape hatch.
 *  The template's Previous/Next buttons and StepperPanel don't apply (the
 *  journey is read-only and the whole card is the interactive element), so
 *  the trigger column renders as a plain div — no nested button, same rule
 *  as every rebuild before. Rails run per-li from inside this circle to
 *  just under the next opaque one (right-[-0.875rem] crosses the gap-3),
 *  colored primary past a completed step, gray ahead of it.
 *  History: Tasks 41-50 (edge-hugging alignment runs, the scale-downs, the
 *  measured center-anchored rails) are superseded by this anatomy — the
 *  ResizeObserver measurement machinery retired with them.
 *  Task 61 — thin-screen compaction (user directive: the progress cards are
 *  a little too tall on mobile): on PHONES the decorative "STEP N" eyebrow
 *  drops out (title + state badge are self-explanatory at 24px circles),
 *  the column/inner gaps tighten (gap-1.5 / gap-0.5), and the nav's
 *  inter-step gap narrows (gap-2) — rails still tuck under the next opaque
 *  circle since the geometry keys off the unchanged size-6 indicator.
 *  sm+ keeps the full c-stepper-7 anatomy verbatim.
 *  Task 62 (user: "Awaiting Decision" wraps to two lines on phones and its
 *  taller column centers the OTHER circles lower — the third circle reads
 *  pushed out of line) — the phone title steps down 13px → 12px with tight
 *  tracking/leading and the nav gap narrows again (gap-1.5), which fits
 *  "Awaiting Decision" on ONE line at iPhone widths; and the trigger column
 *  switches to justify-start on phones so even when a title still wraps on
 *  the thinnest screens every circle stays top-aligned instead of the
 *  shorter columns center-sliding out of the circle row. sm+ untouched. */
export function JourneyStepper({
  status,
  className,
}: {
  status: string;
  /** Row-context override — callers in tight rows pass mt-0 variants to
      retire the built-in top margins (kept from the c-item-10 layout run). */
  className?: string;
}) {
  const { stage, reached: value, reviewing } = journeyProgress(status);

  // Task 51 — the c-stepper-7 steps wear ICONS (template contents remapped
  // to our pipeline), not numerals — the shared journey step vocabulary
  // (journey-vocabulary.tsx): the paper-plane submission, the inspection
  // read, the waiting clock; the decision override still swaps the clock for
  // the ok star / bad × at render time.
  const steps = journeySteps(stage);

  // Decision step rendering — data-driven override (ok star / bad ×); ONE
  // mapping shared by both journey renderers (audit 2026-10-22 dedup).
  const { glyph: decisionGlyph, color: decisionColor } = decisionViz(stage, "sm");

  return (
    <Stepper
      value={value}
      indicators={{
        completed: <CheckIcon className="size-3 sm:size-3.5" />,
        loading: <LoaderCircleIcon className="size-3 animate-spin sm:size-3.5" />,
      }}
      className={cn("mt-1.5 w-full sm:mt-2.5 lg:mt-2", className)}
    >
      {/* Task 62 — items-start on phones: the port's nav centers each li
          vertically, so on thin screens where "Awaiting Decision" still
          wraps (its column grows taller) the shorter columns slide down and
          the circles read out of line. Top-aligning the row pins every
          circle to the same top edge regardless of title wraps; sm+
          restores the template's items-center verbatim. */}
      <StepperNav className="items-start gap-1.5 sm:items-center sm:gap-3">
        {steps.map((step, index) => {
          const isDecision = index === 2;
          const overridden = isDecision && decisionGlyph != null;
          // The item's effective state — mirrors the port's own derivation
          // (getStepState against the live `value`) plus the decision
          // override — so the indicator + badge below key off it directly.
          const state = overridden
            ? "active"
            : index + 1 < value
              ? "completed"
              : index + 1 === value
                ? "active"
                : "inactive";
          // Per-step state badge — the template's third column, remapped to
          // our pipeline's vocabulary. The decided step has FINISHED (its
          // circle carries the outcome), so it reads Completed like the
          // others — success-light on a shortlist, neutral on a rejection.
          const badge =
            state === "completed" || overridden
              ? {
                  text: "Completed",
                  variant:
                    overridden && stage === "Rejected"
                      ? ("secondary-light" as const)
                      : ("success-light" as const),
                }
              : state === "active"
                ? { text: "In Progress", variant: "primary-light" as const }
                : { text: "Pending", variant: "secondary-light" as const };
          return (
            <StepperItem
              key={step.title}
              step={index + 1}
              // c-stepper-44: the spinner follows the live review step.
              loading={index === 1 && reviewing}
              {...(overridden ? { state: "active" as const } : {})}
              className="relative min-w-0 flex-1 items-start"
            >
              {/* Rail — per-li (the li is `relative`), the template's
                  separator geometry: starts INSIDE this circle (left-5
                  phones / left-6 sm+, so the source end is covered) and
                  runs right-[-0.875rem] to tuck under the NEXT opaque
                  circle across the nav's gap-3. Colored from the stage
                  value: primary past a completed step, gray ahead of it —
                  the house pipeline hue, not the template's green. */}
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-5 right-[-0.875rem] top-[11px] h-0.5 sm:left-6 sm:top-[15px]",
                    value > index + 1 ? "bg-primary" : "bg-border"
                  )}
                />
              )}

              {/* The template's trigger column as a plain DIV — the card
                  itself is the interactive element (no nested buttons).
                  items-start left-aligns the whole column per the
                  c-stepper-7 anatomy: circle, then the "STEP N" eyebrow,
                  semibold title and the state Badge. */}
              <div className="flex grow flex-col items-start justify-start gap-1.5 sm:justify-center sm:gap-2.5">
                <StepperIndicator
                  className="size-6 border-2 text-[10px] data-[state=inactive]:border-border data-[state=inactive]:bg-background data-[state=inactive]:text-stone sm:size-8 sm:text-xs"
                  style={overridden ? { backgroundColor: decisionColor } : undefined}
                >
                  {overridden ? decisionGlyph : step.icon}
                </StepperIndicator>
                <div className="flex flex-col items-start gap-0.5 sm:gap-1">
                  {/* Task 61 — the "STEP N" eyebrow is sm+ only: on thin
                      screens it is a whole extra row per step for zero
                      information the badge doesn't already carry. */}
                  <div className="hidden text-[10px] font-semibold uppercase text-muted-foreground sm:block">
                    Step {index + 1}
                  </div>
                  <StepperTitle
                    className={cn(
                      "text-start text-xs font-semibold leading-tight tracking-tight text-ink group-data-[state=inactive]/step:text-muted-foreground sm:text-base sm:leading-snug sm:tracking-normal",
                      overridden && stage === "Shortlisted" && "text-[var(--ok)]",
                      overridden && stage === "Rejected" && "text-[var(--bad)]"
                    )}
                  >
                    {step.title}
                  </StepperTitle>
                  <Badge size="xs" variant={badge.variant}>
                    {badge.text}
                  </Badge>
                </div>
              </div>
            </StepperItem>
          );
        })}
      </StepperNav>
    </Stepper>
  );
}
