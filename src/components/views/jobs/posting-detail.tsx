"use client";

// ============================================================================
// RMIS — Posting detail anatomy (the "complete detail of the job").
// Extracted verbatim from the Job Opportunities board's right-hand pane
// (jobs/applicant-jobs-board.tsx) so TWO surfaces speak the exact same
// posting language:
//   · the board's sticky detail pane (list ↔ detail explorer), and
//   · the dedicated #/job-detail?job=<id> page (jobs/job-detail-view.tsx) —
//     the destination the applicant home's "Read full description" button
//     deep-links to (user request: that button must open the COMPLETE job
//     page where the apply flow lives, not the Job Opportunities list; only
//     "View All" routes to the list).
// Contents: display title + Applied pill, icon meta rows with full division
// names, posted age, brand-blue Apply (locked when applied/overdue) +
// ghost Save, then the full body — brief description paragraphs and the
// Responsibilities / Qualifications / Compensation sections (sanitized rich
// HTML when present, else plain-text disc bullets).
// `backLabel` lets the host tune the mobile back affordance (the board pane
// returns to its register; the standalone page returns to the home).
// ============================================================================

import {
  AlertCircle,
  Banknote,
  Bookmark,
  Briefcase,
  Building2,
  ChevronLeft,
  Clock,
  MapPin,
} from "lucide-react";
import { ctaBtn, ghostBtn } from "@/components/ui/buttons";
import { StatusPill } from "@/components/ui/shell";
import { formatCurrency, formatDate, humanize, timeAgo } from "@/lib/client";
import { divisionFullName } from "@/lib/constants";
import type { JobWire } from "@/lib/router";
import { postedAt, jobDeadlinePassed } from "@/lib/job-meta";
import { cn } from "@/lib/utils";

/** Plain-text posting section rendered as a disc bullet list. */
export function TextBullets({ text }: { text: string }) {
  const items = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  if (items.length === 0) return null;
  return (
    <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed text-stone">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** Posting section: sanitized rich HTML when present, else text bullets. */
export function PostingSection({ title, html, text }: { title: string; html: string | null; text: string | null }) {
  if (html && html.trim()) {
    return (
      <section className="space-y-3">
        <h3 className="text-lg font-medium text-ink">{title}</h3>
        <div className="rich-text text-base leading-relaxed text-stone" dangerouslySetInnerHTML={{ __html: html }} />
      </section>
    );
  }
  if (text && text.trim()) {
    return (
      <section className="space-y-3">
        <h3 className="text-lg font-medium text-ink">{title}</h3>
        <TextBullets text={text} />
      </section>
    );
  }
  return null;
}

export function JobDetail({
  job,
  saved,
  applied,
  onApply,
  onSave,
  onBack,
  backLabel = "Back to job list",
}: {
  job: JobWire;
  saved: boolean;
  applied: boolean;
  onApply: () => void;
  onSave: () => void;
  onBack: () => void;
  /** Mobile back affordance — the board pane returns to its register, the
      standalone #/job-detail page returns to the home's Job Openings. */
  backLabel?: string;
}) {
  const pos = job.position;
  const title = pos?.positionTitle || job.title || "Position Title Unavailable";
  const salary = pos?.salaryAmount ?? null;
  const deadline = job.deadlineDate;
  const overdue = jobDeadlinePassed(deadline);
  const applyLocked = overdue || applied;

  const meta: { icon: typeof MapPin; label: string; num?: boolean; danger?: boolean }[] = [];
  // Division meta rows read the full updated division name (MOM 2026-10-13).
  if (job.position?.division) meta.push({ icon: Building2, label: divisionFullName(job.position.division) });
  if (job.positionType) meta.push({ icon: Briefcase, label: humanize(job.positionType) });
  if (salary != null)
    meta.push({
      icon: Banknote,
      label: `${formatCurrency(salary)} per month${
        pos?.salaryGrade ? ` · SG ${pos.salaryGrade}${pos.salaryStep ? `/${pos.salaryStep}` : ""}` : ""
      }`,
      num: true,
    });
  meta.push({
    icon: Clock,
    label: overdue ? "Closed: deadline passed" : deadline ? `Closes ${formatDate(deadline)}` : "Open until filled",
    num: !overdue && !deadline,
    danger: overdue,
  });

  return (
    <div>
      {/* Mobile — back to the host surface */}
      <button
        type="button"
        onClick={onBack}
        className="focus-ring mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-metric-blue lg:hidden"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {backLabel}
      </button>

      {/* Posting title — the house page-title step (24px). The pane is a
          document view: it must sit below the hero, not compete. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 className="min-w-0 text-2xl font-medium leading-tight text-ink">{humanize(title)}</h2>
        {applied && <StatusPill status="Applied" variant="info" className="shrink-0" />}
      </div>

      {/* Icon meta rows — the location line is GONE (user: the division row
          right below already carries the same full name, so the pair read as
          duplicates; MOM 2026-10-13 full names kept). */}
      <ul className="mt-4 space-y-2.5">
        {meta.map((m, i) => (
          <li
            key={i}
            className={cn(
              "flex items-start gap-2.5 text-base",
              m.danger ? "font-medium text-[var(--bad)]" : "text-stone"
            )}
          >
            <m.icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-stone" aria-hidden="true" />
            <span className={cn(m.num && "num")}>{m.label}</span>
          </li>
        ))}
      </ul>

      <p className="num mt-4 text-sm text-stone">Posted {timeAgo(postedAt(job))}</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onApply}
          disabled={applyLocked}
          title={
            applied
              ? "You already have an active application for this position — track it on your Home"
              : undefined
          }
          className={ctaBtn}
        >
          {applied ? "Applied" : "Apply"}
        </button>
        <button
          type="button"
          onClick={onSave}
          aria-pressed={saved}
          className={ghostBtn}
        >
          <Bookmark className={cn("h-4 w-4", saved && "fill-current")} aria-hidden="true" />
          {saved ? "Saved" : "Save"}
        </button>
        {overdue && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--bad)]">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> Deadline passed
          </span>
        )}
      </div>

      {/* Posting body */}
      <div className="mt-8 space-y-8 border-t border-divider pt-8">
        {job.briefDescription &&
          job.briefDescription
            .split(/\n{2,}/)
            .filter((p) => p.trim())
            .map((p, i) => (
              <p key={i} className="text-base leading-relaxed text-stone">
                {p}
              </p>
            ))}
        <PostingSection
          title="Qualifications"
          html={job.otherQualificationsHtml}
          text={job.otherQualifications}
        />
        <PostingSection title="Compensation" html={job.compensationHtml} text={job.compensationPackage} />
      </div>
    </div>
  );
}
