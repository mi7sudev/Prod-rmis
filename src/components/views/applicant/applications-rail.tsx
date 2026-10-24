"use client";

// ============================================================================
// RMIS — "Your Applications · In Progress" rail (header + journey cards +
// the application-history drawer). Extracted verbatim from
// applicant-home.tsx (architecture candidate ⑥). The journey pieces live in
// applicant/journey-card + applicant/application-history-drawer.
// ============================================================================

import { useState } from "react";
import { ArrowRight, Briefcase, Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/shell";
import { navigate, type ApplicationWire } from "@/lib/router";
import { ApplicationJourneyCard } from "@/components/views/applicant/journey-card";
import { ApplicationsHistoryDrawer } from "@/components/views/applicant/application-history-drawer";

/** "Your Applications · In Progress" rail — header + journey cards (detail
 *  modal on click, Cancel Application while Submitted) and a "View All" pill
 *  that opens the application-history drawer (QA 2026-10-21, user directive).
 *  Rendered twice with
 *  breakpoint isolation: directly below the mini profile on desktop (user
 *  directive — moved out of the retired two-pane workspace) and as the
 *  phones' list below the compact banner. The desktop copy's card list is
 *  height-MATCHED to the Bookmarked Jobs list (QA 2026-10-21 follow-up,
 *  user directive "match them"): the hero grid row is viewport-bounded
 *  (lg:h = 100dvh − 6.5rem) and the list flex-fills its column, so both
 *  lists end on the SAME visible line near the fold and grow/shrink with
 *  the user's screen height — an internal thin-scrollbar scroll carries
 *  the overflow. Phones keep their natural page-flow height; every fill
 *  class is lg:-scoped so their copy is untouched. Only the desktop copy receives
 *  domId/titleId — the ids must stay unique in the DOM, and the desktop copy
 *  is the Applications stat card's scroll target plus the tour anchor. The
 *  tour skips hidden/missing [data-tour] targets on its own (Task 20), so
 *  phones simply hop over that step. */
export function ApplicationsRail({
  apps,
  onOpen,
  domId,
  titleId,
}: {
  apps: ApplicationWire[];
  onOpen: (app: ApplicationWire) => void;
  domId?: string;
  titleId?: string;
}) {
  // "View All" → application-history drawer (QA 2026-10-21, user directive).
  // Each rail copy owns its drawer instance (breakpoint isolation); only the
  // visible copy's button is reachable, so the two never fight.
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <>
      <section
        {...(domId ? { id: domId, "data-tour": "my-applications" } : {})}
        aria-labelledby={titleId}
        className="min-w-0 scroll-mt-24 lg:flex lg:flex-1 lg:min-h-0 lg:flex-col"
      >
      <div className="flex items-end justify-between gap-2 border-b border-border pb-4">
        <div>
          <p className="eyebrow">Your Applications</p>
          <h2 id={titleId} className="mt-1.5 text-xl font-medium tracking-[0.01em] text-ink sm:text-2xl">
            In Progress
          </h2>
        </div>
        {/* View All — opens the application-history drawer (QA 2026-10-21,
            user directive). Occupies the slot the retired count pill left in
            the header row; hidden while the rail is empty (the empty state's
            Browse Positions CTA owns that moment). */}
        {apps.length > 0 && (
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-haspopup="dialog"
            className="dlg-ghost focus-ring inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium"
          >
            View All <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {/* The header count pill (status-neutral "− 02" glyph + total) is
          RETIRED (QA 2026-10-21, user directive) — the heading now stands
          alone above the rail. */}
      {/* The lg fill chain starts here: section (flex-1 of the hero row's
          right column) → this wrapper (flex-1) → the card list (flex-1,
          min-h floor) — the desktop list stretches to the column bottom so
          its last pixel lines up with Bookmarked Jobs across the gutter. */}
      <div className="mt-5 lg:flex lg:flex-1 lg:min-h-0 lg:flex-col">
        {apps.length === 0 ? (
          <div className="dlg-card">
            <EmptyState
              icon={Inbox}
              tone="plum"
              title="No applications yet"
              description="Browse open positions to start your application journey."
              action={
                <button
                  type="button"
                  onClick={() => navigate("job-opportunities")}
                  className="dlg-cta inline-flex min-h-[44px] items-center gap-2 px-6 py-2.5 text-sm"
                >
                  <Briefcase className="h-4 w-4" aria-hidden="true" /> Browse Positions
                </button>
              }
            />
          </div>
        ) : (
          <div className="space-y-3 scroll-thin pb-1 sm:space-y-4 lg:min-h-[160px] lg:flex-1 lg:overflow-y-auto lg:pr-1">
            {apps.map((app) => (
              <ApplicationJourneyCard key={app.id} app={app} onOpen={() => onOpen(app)} />
            ))}
          </div>
        )}
      </div>
      </section>
      <ApplicationsHistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        apps={apps}
      />
    </>
  );
}
