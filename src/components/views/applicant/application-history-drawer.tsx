"use client";

// ============================================================================
// RMIS — Application history drawer (QA 2026-10-21, user directive) + the
// journey timeline inside its expanded row. Extracted verbatim from
// applicant-home.tsx (architecture candidate ⑥). Stage → label/glyph/
// behavior comes from the journey vocabulary module
// (applicant/journey-vocabulary), which re-uses lib/status + lib/status-ui.
// ============================================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT } from "@/lib/ease";
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline";
import { CalendarDays, CheckIcon, ChevronDown, LoaderCircleIcon, X } from "lucide-react";
import { Drawer } from "@/components/motion/drawer";
import { StatusPill } from "@/components/ui/shell";
import { formatDate } from "@/lib/client";
import type { ApplicationWire } from "@/lib/router";
import { jobPlace } from "@/lib/job-meta";
import { cn } from "@/lib/utils";
import {
  decisionStepTitle,
  decisionViz,
  journeyInReview,
  journeyProgress,
  stageVariant,
} from "@/components/views/applicant/journey-vocabulary";

/** Application journey timeline inside the history drawer's expanded row
 *  (QA 2026-10-21, user directive) — the reui c-timeline-3 block pattern
 *  (Timeline primitives vendored at @/components/reui/timeline; geometry
 *  classes VERBATIM from the block: ms-10 items, size-6 indicators at
 *  -left-7, separators h-[calc(100%-1.5rem-0.25rem)] translate-y-6.5) run
 *  over the SAME §7.3 pipeline semantics as the journey cards' stepper:
 *  Submitted → Under Review → Decision, controlled value = reached stage
 *  (shared journeyProgress law). Item 1 is the only DATED step — the
 *  wire carries just dateApplied (no review/decision timestamps are
 *  tracked), so later stages speak through descriptions instead of invented
 *  dates. Indicator glyphs follow the system's functional vocabulary: the
 *  template check on completed steps (hidden on pending via the block's
 *  group-not-data-completed variant), the syncing spinner while HR holds the
 *  application, and the decision override — ok star / bad × on the system's
 *  --ok/--bad tints (Rejected must never read as progress), titles tinted to
 *  match. Pending titles sit in stone so the achieved spine stays ink. */
function ApplicationHistoryTimeline({ app }: { app: ApplicationWire }) {
  const { stage, reached: value, decided, reviewing } = journeyProgress(app.status);

  const stages = [
    {
      title: "Application Submitted",
      date: formatDate(app.dateApplied),
      description: "Your application has been received by the Human Resource Office.",
    },
    {
      title: "Under Review",
      date: null as string | null,
      description: reviewing
        ? "HR is currently evaluating your application."
        : decided
          ? "Your application passed the initial review."
          : "HR will evaluate your application next.",
    },
    {
      title: decisionStepTitle(stage),
      date: null as string | null,
      description:
        stage === "Shortlisted"
          ? "You've been shortlisted — HR will contact you for the next steps."
          : stage === "Rejected"
            ? "Your application was not shortlisted. You may apply for other open positions."
            : "You will be notified once a decision is made.",
    },
  ];

  const { glyph: decisionGlyph, color: decisionColor } = decisionViz(stage, "base");

  return (
    <Timeline value={value} className="w-full">
      {stages.map((s, index) => {
        const step = index + 1;
        const isDecision = index === 2;
        const overridden = isDecision && decisionGlyph != null;
        const completed = step <= value;
        return (
          <TimelineItem
            key={s.title}
            step={step}
            className="group-data-[orientation=vertical]/timeline:ms-10"
          >
            <TimelineHeader>
              <TimelineSeparator className="group-data-[orientation=vertical]/timeline:-left-7 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.5rem-0.25rem)] group-data-[orientation=vertical]/timeline:translate-y-6.5" />
              {s.date && (
                <TimelineDate dateTime={app.dateApplied} className="num">
                  {s.date}
                </TimelineDate>
              )}
              <TimelineTitle
                className={cn(
                  !completed && "text-stone",
                  overridden && stage === "Shortlisted" && "text-[var(--ok)]",
                  overridden && stage === "Rejected" && "text-[var(--bad)]"
                )}
              >
                {s.title}
              </TimelineTitle>
              <TimelineIndicator
                style={overridden ? { backgroundColor: decisionColor } : undefined}
                className="group-data-completed/timeline-item:bg-primary group-data-completed/timeline-item:text-primary-foreground flex size-6 items-center justify-center group-data-completed/timeline-item:border-none group-data-[orientation=vertical]/timeline:-left-7"
              >
                {overridden ? (
                  decisionGlyph
                ) : index === 1 && reviewing ? (
                  /* c-stepper-44 trick, timeline edition — the syncing
                     spinner rides the live review step. */
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                ) : (
                  <CheckIcon className="size-3.5 group-not-data-completed/timeline-item:hidden" />
                )}
              </TimelineIndicator>
            </TimelineHeader>
            <TimelineContent className="text-xs leading-snug">{s.description}</TimelineContent>
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}

/** "Application History" drawer (QA 2026-10-21, user directive) — opened by
 *  the rail header's "View All" pill on either rail copy. Lists EVERY
 *  application at every stage, newest first (the rail receives its list
 *  pre-sorted), as compact rows: title / place / applied date + the same
 *  StatusPill treatment the journey cards wear (regular weight — the bold
 *  variant stays scoped to the journey cards) + a round dropdown chevron.
 *  Clicking the row OR the chevron expands that row IN PLACE into the
 *  application's journey timeline (c-timeline-3, see above) — the drawer is
 *  self-contained now, no modal handoff (QA 2026-10-21 follow-up, user
 *  directive; the full posting stays one click away on the rail's journey
 *  cards). One row expands at a time (accordion); opening the drawer starts
 *  collapsed. The header runs a size smaller on phones (user directive:
 *  "too big on mobile", tightened twice — hairline padding, 14px title,
 *  10px meta, 28px close) and keeps the sm+ scale on larger panels. beui
 *  motion/drawer vendored for the panel (focus trap, Escape/backdrop
 *  dismiss, body-scroll lock included). */
export function ApplicationsHistoryDrawer({
  open,
  onOpenChange,
  apps,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apps: ApplicationWire[];
}) {
  // Accordion state — one expanded timeline at a time; a fresh drawer open
  // starts collapsed. The reset rides an effect on `open` (NOT an
  // onOpenChange wrapper): the View All button flips `open` directly, so
  // internal open/close events never fire on the primary open path.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  useEffect(() => {
    if (open) setExpandedId(null);
  }, [open]);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      ariaLabel="Application history"
      className="sm:w-96"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-3.5 pb-2.5 pt-3 sm:px-5 sm:pb-4 sm:pt-5">
        <div className="min-w-0">
          <p className="eyebrow">Your Applications</p>
          <h2 className="mt-0 font-display text-sm font-medium tracking-[0.01em] text-ink sm:mt-1 sm:text-lg">
            Application History
          </h2>
          <p className="mt-0.5 text-[10px] text-stone sm:text-xs">
            {apps.length} {apps.length === 1 ? "application" : "applications"} on record
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-full border border-divider bg-background text-stone transition-colors hover:bg-fog hover:text-ink sm:h-9 sm:w-9"
        >
          <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin">
        <ul className="divide-y divide-border">
          {apps.map((app) => {
            const { label } = journeyProgress(app.status);
            const place = app.job ? jobPlace(app.job) : null;
            const expanded = expandedId === app.id;
            return (
              <li key={app.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : app.id)}
                  aria-expanded={expanded}
                  aria-controls={`app-history-panel-${app.id}`}
                  className={cn(
                    "focus-ring flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-fog/60 sm:px-5",
                    expanded && "bg-fog/60"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-snug text-ink">
                      {app.job?.title ?? "Position"}
                    </span>
                    {place && (
                      <span className="mt-0.5 block truncate text-xs text-stone">{place}</span>
                    )}
                    <span className="mt-1 flex items-center gap-1.5 text-[11px] text-stone">
                      <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" /> Applied{" "}
                      <span className="num">{formatDate(app.dateApplied)}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <StatusPill
                      status={label}
                      variant={stageVariant(label)}
                      pulse={journeyInReview(label)}
                      className="shrink-0"
                    />
                    {/* The dropdown affordance — visually its own round
                        control, functionally part of this toggle button (a
                        nested <button> would be invalid HTML inside it). */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-full border border-divider bg-background text-stone transition-transform duration-200",
                        expanded && "rotate-180 border-primary/40 text-primary"
                      )}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </span>
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      key="panel"
                      id={`app-history-panel-${app.id}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.24, ease: EASE_OUT }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-divider/70 bg-fog/40 px-4 pb-5 pt-4 sm:px-5">
                        <ApplicationHistoryTimeline app={app} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="border-t border-border px-4 py-3 text-[11px] leading-snug text-stone sm:px-5">
        Select an application to view its journey timeline.
      </div>
    </Drawer>
  );
}
