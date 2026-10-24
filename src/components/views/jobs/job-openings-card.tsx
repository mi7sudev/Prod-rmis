"use client";

// ============================================================================
// RMIS — Job Openings row card (shared applicant browsing surface).
// The applicant-tuned job card: the summary is deliberately inert so the
// capsule chevron is the single door to the in-place quick view, where the
// solid "Read full description" button deep-links into the full posting
// (where the apply flow lives). Applicant extras kept: the gold Applied pill
// beside the title and the applied notice inside the quick view.
// Quick view (user QA: the dropdown used to repeat the card's truncated
// snippet verbatim) — the expansion now carries the FULL description plus
// the Responsibilities / Qualifications sections the summary never shows,
// via the shared JobQuickSection below.
// Consumers (Task 20 — the home section moved off mobile):
//   · applicant-home.tsx — the desktop "Job Openings / Apply Now" pane
//     (lg+ only; on phones the home no longer carries the browsing list).
//     The quick view's "Read full description" deep-links to the DEDICATED
//     complete-posting page (#/job-detail?job=<id>) — only "View All" routes
//     to the Job Opportunities list (user request).
//   · public-landing.tsx — imports JobQuickSection for its own card's
//     quick view so both dropdowns speak the same expansion language.
// ============================================================================

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowRight, Bookmark, ChevronDown } from "lucide-react";
import { QuickFact, StatusPill } from "@/components/ui/shell";
import { formatCurrency, formatDate, humanize, timeAgo } from "@/lib/client";
import type { JobWire } from "@/lib/router";
import { jobPlace, postedAt, jobDeadlinePassed } from "@/lib/job-meta";
import { cn } from "@/lib/utils";

// startOfToday / deadline predicates live in lib/job-meta (single source —
// shared with the server gates). The card previously used Date.now() here,
// which flagged a posting closing TODAY as "Deadline passed" while the apply
// gate still accepted it.

/**
 * Compact posting-body section for the card quick view (the dropdown):
 * sanitized rich HTML when present, else plain-text disc bullets — the same
 * content precedence as the full posting pane (posting-detail's
 * PostingSection) at quick-view sizes. Renders nothing when the job carries
 * neither variant. Exported so the Job Opportunities board's own card
 * (public-landing) renders the identical expansion.
 */
export function JobQuickSection({
  title,
  html,
  text,
}: {
  title: string;
  html: string | null;
  text: string | null;
}) {
  const rich = html?.trim() ?? "";
  const plain = text?.trim() ?? "";
  if (!rich && !plain) return null;
  return (
    <div className="mt-5">
      <h4 className="text-base font-medium text-ink sm:text-lg">{title}</h4>
      {rich ? (
        <div
          className="rich-text mt-2 text-sm leading-relaxed text-stone"
          dangerouslySetInnerHTML={{ __html: rich }}
        />
      ) : (
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone">
          {plain
            .split(/\r?\n/)
            .map((line) => line.replace(/^[-•*]\s*/, "").trim())
            .filter(Boolean)
            .map((item, i) => (
              <li key={i}>{item}</li>
            ))}
        </ul>
      )}
    </div>
  );
}

export function JobListCard({
  job,
  applied,
  expanded,
  saved,
  onToggle,
  onSave,
  onOpen,
}: {
  job: JobWire;
  applied: boolean;
  expanded: boolean;
  saved: boolean;
  onToggle: () => void;
  onSave: () => void;
  onOpen: () => void;
}) {
  const reduced = useReducedMotion();
  const pos = job.position;
  const title = pos?.positionTitle || job.title || "Position Title Unavailable";
  const company = pos?.division || "DOST-MIRDC";
  const salary = pos?.salaryAmount ?? null;
  const deadline = job.deadlineDate;
  const overdue = jobDeadlinePassed(deadline);

  return (
    <article className="dlg-card lift">
      {/* Static summary — deliberately not clickable: the chevron below is
          the single door to the quick view and its description jump. */}
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="min-w-0 text-lg font-medium leading-snug text-ink">{humanize(title)}</h3>
          {applied && <StatusPill status="Applied" variant="info" className="shrink-0" />}
        </div>
        <p className="mt-1 text-lg text-ink">{company}</p>
        <p className="mt-2.5 text-sm text-stone">{jobPlace(job)}</p>
        {salary != null && <p className="num mt-0.5 text-sm text-stone">{formatCurrency(salary)} per month</p>}
        {job.briefDescription && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone">{job.briefDescription}</p>
        )}
      </div>

      {/* Bottom register — posted age left, quick-view + bookmark right */}
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2 sm:px-3.5">
        <span className="num px-2 py-1.5 text-xs text-stone">{timeAgo(postedAt(job))}</span>
        <div className="flex items-center">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse: ${humanize(title)}` : `Quick view: ${humanize(title)}`}
            className="focus-ring grid h-9 w-9 place-items-center rounded-full text-stone transition-colors hover:bg-white/70 hover:text-ink"
          >
            <ChevronDown
              className={cn("h-[18px] w-[18px] transition-transform duration-200", expanded && "rotate-180")}
            />
          </button>
          <button
            type="button"
            onClick={onSave}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${humanize(title)} from saved` : `Save ${humanize(title)}`}
            className="focus-ring grid h-9 w-9 place-items-center rounded-full text-stone transition-colors hover:bg-white/70 hover:text-ink"
          >
            <Bookmark className={cn("h-[18px] w-[18px]", saved && "fill-current text-metric-blue")} />
          </button>
        </div>
      </div>

      {/* Quick view — inline expansion: the clicked card opens IN PLACE with
          a clamped job description and the position's vital facts. SMOOTH
          HEIGHT GLIDE via framer-motion (reduced-motion users get a plain
          opacity crossfade). */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="quickview"
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduced ? { duration: 0.15, ease: "linear" } : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-divider px-4 pb-6 pt-4 sm:px-5 sm:pt-5">
              {job.briefDescription && (
                <div>
                  <h4 className="text-base font-medium text-ink sm:text-lg">Job description</h4>
                  {/* FULL description, unclamped (user QA: the dropdown used
                      to repeat the card's 2-line snippet) — same blank-line
                      paragraph split as the full posting body. */}
                  {job.briefDescription
                    .split(/\n{2,}/)
                    .filter((p) => p.trim())
                    .map((p, i) => (
                      <p key={i} className="mt-2 text-sm leading-relaxed text-stone">
                        {p}
                      </p>
                    ))}
                </div>
              )}
              {/* The dropdown alternative (user QA): the posting sections the
                  card summary never shows — so expanding reveals MORE than
                  the snippet, not the same text again. */}
              <JobQuickSection title="Qualifications" html={job.otherQualificationsHtml} text={job.otherQualifications} />
              {/* 3-up everywhere: a 6-up row inside the 7/12 pane leaves
                  ~50-85px per fact, which wraps currency mid-number. */}
              <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 sm:gap-x-8">
                <QuickFact label="Item No." value={pos?.itemNumber ?? "-"} />
                <QuickFact label="Vacancies" value={String(job.numberOfVacancy ?? "-")} />
                <QuickFact
                  label="Salary Grade"
                  value={pos?.salaryGrade ? `SG ${pos.salaryGrade}${pos.salaryStep ? `/${pos.salaryStep}` : ""}` : "-"}
                />
                <QuickFact label="Monthly Salary" value={salary != null ? formatCurrency(salary) : "-"} />
                <QuickFact label="Published" value={formatDate(job.publishDate)} />
                <QuickFact
                  label="Deadline"
                  value={overdue ? <span className="text-[var(--bad)]">{formatDate(deadline)}</span> : formatDate(deadline)}
                />
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {/* Read full description — the quick view's primary action;
                    deep-links into the complete posting, where the apply
                    flow lives. */}
                <button
                  type="button"
                  onClick={onOpen}
                  className="dlg-cta focus-ring inline-flex min-h-[44px] items-center gap-2 px-6 py-2.5 text-sm"
                >
                  Read full description <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                {applied && <StatusPill status="Applied (track it on your Home)" variant="info" />}
                {overdue && !applied && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--bad)]">
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> Deadline passed
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
