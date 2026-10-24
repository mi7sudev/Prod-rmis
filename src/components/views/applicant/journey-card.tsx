"use client";

// ============================================================================
// RMIS — Application journey card (the "Your Applications · In Progress"
// rail's card). Extracted verbatim from applicant-home.tsx (architecture
// candidate ⑥). Stage → label/hue/behavior comes from the journey vocabulary
// module (applicant/journey-vocabulary), which re-uses lib/status +
// lib/status-ui.
// ============================================================================

import { CalendarDays, ChevronRight, LoaderCircleIcon, MapPin } from "lucide-react";
import { Badge } from "@/components/reui/badge";
import { formatDate } from "@/lib/client";
import type { ApplicationWire } from "@/lib/router";
import { jobPlace } from "@/lib/job-meta";
import { cn } from "@/lib/utils";
import {
  journeyBadgeVariant,
  journeyInReview,
  journeyProgress,
  nextStepHint,
  stageVariant,
} from "@/components/views/applicant/journey-vocabulary";
import { JourneyStepper } from "@/components/views/applicant/journey-stepper";

/** Task 47 — the card REVERTED to the previous whole-card <button> layout
 *  (user directive: "bring back the previous application card before we
 *  applied the reu[i]") after the Task 45/46 c-item-10 experiment: the
 *  posting title leads the first line, the status badge rides top-right
 *  beside the chevron affordance, the MapPin place line and the
 *  CalendarDays applied line return beneath it, the journey stepper runs
 *  the card's middle, and the hairline "Next Step" block closes it.
 *  THE ONE KEEPER: the status display stays the reui Badge the user liked
 *  ("just leave the status that we have now i like it") — the §7.3
 *  stageVariant hue mapped onto the Badge's light family, bold pill weight,
 *  the spinning loader while HR holds the application ("In Review"), and
 *  the desktop one-size-up (QA 2026-10-21) via lg: overrides. The whole
 *  card remains one big button (keyboard path = aria-haspopup + label). */
export function ApplicationJourneyCard({ app, onOpen }: { app: ApplicationWire; onOpen: () => void }) {
  const { stage, label } = journeyProgress(app.status);
  // The reui Badge wears the SAME functional hue the StatusPill system
  // speaks (stageVariant) — mapped onto the Badge's light variant family.
  const badgeVariant = journeyBadgeVariant(stageVariant(label));
  // Task 24 — Place of assignment retired; the card's MapPin line speaks the
  // shared jobPlace read (division full name → agency address).
  const place = app.job ? jobPlace(app.job) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`View complete posting and application details: ${app.job?.title ?? "position"}`}
      className="dlg-card lift focus-ring min-h-[44px] w-full p-3 text-left sm:p-5 lg:py-4"
    >
      {/* Header — the title LEADS the row and the status badge rides the
          SAME first line (user directive from the original layout: the pill
          no longer owns its own row pushing the title down); `min-w-0` lets
          a long title wrap beneath itself in the remaining width while
          `shrink-0` pins the badge+chevron pair at the top-right. The
          chevron is the whole-card affordance. The badge keeps every class
          it wore on the c-item-10 card — same light hue family, bold
          weight, syncing spinner, desktop size-up. Task 63 (user: the
          status pill is too small to read on the phone's thin screen) —
          MOBILE ONLY size-up: below sm the pill grows to a 12px semibold
          label with roomier padding and a 14px icon (the In Review spinner
          reads at arm's length), via max-sm: variants so sm+ keeps its
          exact previous anatomy (11px at sm, the lg: size-up untouched). */}
      <div className="flex items-start justify-between gap-2.5">
        <h3 className="min-w-0 text-base font-medium leading-snug text-ink sm:text-lg">{app.job?.title ?? "Position"}</h3>
        <span className="flex shrink-0 items-center gap-1.5">
          <Badge
            variant={badgeVariant}
            size="xs"
            className="font-semibold max-sm:px-2.5 max-sm:py-1 max-sm:text-xs max-sm:[&>svg]:size-3.5 sm:text-[11px] lg:px-3 lg:py-1 lg:text-xs lg:[&>svg]:h-3.5 lg:[&>svg]:w-3.5"
          >
            {journeyInReview(label) && (
              <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
            )}
            {label}
          </Badge>
          <ChevronRight
            aria-hidden="true"
            className="h-4 w-4 text-pebble transition-all duration-200 group-hover:translate-x-0.5"
          />
        </span>
      </div>
      {place && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-stone sm:mt-2 lg:mt-1.5">
          <MapPin className="h-4 w-4" aria-hidden="true" /> {place}
        </p>
      )}
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone sm:mt-1">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Applied{" "}
        <span className="num">{formatDate(app.dateApplied)}</span>
      </p>

      <JourneyStepper status={app.status} />

      {/* Next Step hint — the card's closing block (the full posting lives
          one click away, in the application detail modal). Mobile keeps it
          to a two-line clamp with the eyebrow dropped — height direction.
          Desktop rides one gap tighter at lg (Task 41 height compaction).
          Task 61 — the closing divider block pulls up one notch on phones
          (mt-1.5/pt-1.5) as part of the thin-screen compaction pass. */}
      <div className="mt-1.5 border-t border-divider pt-1.5 sm:mt-3 sm:pt-2.5 lg:mt-2.5 lg:pt-2">
        <p className="eyebrow hidden text-stone sm:block">Next Step</p>
        <p className="mt-0 text-[11px] leading-snug text-stone line-clamp-2 sm:mt-1 sm:line-clamp-none sm:text-xs sm:leading-relaxed">{nextStepHint(stage)}</p>
      </div>
    </button>
  );
}
