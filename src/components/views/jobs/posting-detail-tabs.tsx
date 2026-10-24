"use client";

// ============================================================================
// RMIS — Shared job-posting DETAIL sections (Task 39).
// Extracted VERBATIM from views/jobs/job-posting-detail.tsx so the job
// posting PAGE and the applicant's application-detail MODAL render the exact
// same "Description | Requirements" tab anatomy (user directive: the
// application modal must match the job detail UI/UX). Exports:
//   sgLabel     — Salary Grade caption ("SG19/1")
//   RichOrPlain — rich HTML body when present, else pre-line plain text
//   INK_CTA     — the reference's FIXED dark-ink CTA class string (a literal
//                 on purpose: the button stays the dark slab on both themes)
//   DetailTabs  — the "Description | Requirements" tab section (Task 30:
//                 Description = Overview + Compensation + Timeline;
//                 Requirements = Qualifications + MQR + Key Competency)
// RichOrPlain moved with DetailTabs because the page's remaining call site
// (the mobile sheet's Key Competency fold) imports it back from here; the
// mobile drawer keeps its own 15px SheetRich reading size.
// ============================================================================

import { useState } from "react";
import { Clock } from "lucide-react";
import { deadlineState, formatDate } from "@/lib/client";
import { CollapsibleSection } from "@/components/jobs/collapsible-section";
import type { JobWire } from "@/lib/router";

export function sgLabel(grade: string | null | undefined, step: string | null | undefined): string {
  if (!grade) return "-";
  return step ? `SG${grade}/${step}` : `SG${grade}`;
}

export function RichOrPlain({ html, text }: { html?: string | null; text?: string | null }) {
  if (html && html.trim()) {
    return (
      <div
        className="rich-text text-sm leading-relaxed text-stone"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  if (text && text.trim()) {
    return <p className="whitespace-pre-line text-sm leading-relaxed text-stone">{text}</p>;
  }
  return <p className="text-sm text-stone">Not provided.</p>;
}

/* The reference's dark-ink CTA (near-black navy, white ink, 12px radius) —
   a FIXED ink literal on purpose: the button must stay the reference's dark
   slab on both themes (bg-ink would flip light at night); the night ring
   keeps its edge readable on the raised card. */
export const INK_CTA =
  "focus-ring inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#0e1c26] text-sm font-medium text-white transition-colors hover:bg-[#1c313c] disabled:pointer-events-none disabled:opacity-50 dark:ring-1 dark:ring-white/10";

export function DetailTabs({ job }: { job: JobWire }) {
  const pos = job.position;
  const dl = deadlineState(job.deadlineDate);
  const [tab, setTab] = useState<"description" | "requirements">("description");

  const mqrRows: [string, string | null | undefined][] = [
    ["Education", pos?.cscEducation],
    ["Work Experience", pos?.cscWorkExperience],
    ["Training", pos?.cscTraining],
    ["Eligibility", pos?.cscEligibilityGroup],
    ["License / Certification", pos?.license],
  ];
  const visibleMqr = mqrRows.filter(([, v]) => v && !/^(n\/?a|none|na)\.?$/i.test(v.trim()));

  const tabs = [
    { id: "description", label: "Description" },
    { id: "requirements", label: "Requirements" },
  ] as const;

  return (
    <section aria-label="Position information" className="mt-7">
      <div
        role="tablist"
        aria-label="Position information sections"
        className="flex gap-6 border-b border-border"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`job-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`job-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`focus-ring relative min-h-[48px] px-1 text-sm transition-colors ${
              tab === t.id
                ? "font-medium text-ink after:bg-primary"
                : "text-body-gray hover:text-ink after:bg-transparent"
            } after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Description tab (Task 30) — what the job IS: the Overview plus the
          offer facts (compensation + timeline). */}
      <div
        role="tabpanel"
        id="job-panel-description"
        aria-labelledby="job-tab-description"
        hidden={tab !== "description"}
        className="space-y-7 pt-6"
      >
        <div>
          <h2 className="text-base font-bold text-ink">Overview</h2>
          <div className="mt-2.5">
            <RichOrPlain html={job.briefDescriptionHtml} text={job.briefDescription} />
          </div>
        </div>

        <div>
          <h2 className="text-base font-bold text-ink">Compensation Package</h2>
          <div className="mt-2.5">
            <RichOrPlain html={job.compensationHtml} text={job.compensationPackage} />
          </div>
        </div>

        <div>
          <h2 className="text-base font-bold text-ink">Timeline</h2>
          {/* Task 91 (user request) — the Processing tile is gone from the
              applicant-facing tabs (job sheet + application detail modal):
              the processing date is an internal HR scheduling fact. Staff
              still see it in the job workspace record; the API nulls the
              field for non-staff viewers. Published + Deadline remain. */}
          <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-cloud/60 p-4">
              <p className="text-xs text-body-gray">Published</p>
              <p className="num mt-0.5 text-sm text-ink">{formatDate(job.publishDate ?? job.publishedAt)}</p>
            </div>
            <div className="rounded-xl bg-cloud/60 p-4">
              <p className="text-xs text-body-gray">Deadline</p>
              <p
                className={`num mt-0.5 flex items-center gap-1.5 text-sm ${
                  dl.overdue ? "text-[var(--bad)]" : "text-ink"
                }`}
              >
                {/* Hue never carries state alone — the overdue date gets the
                    same Clock glyph the recruitment table pairs with it. */}
                {dl.overdue && <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {formatDate(job.deadlineDate)}
                {job.deadlineDate ? ` · ${dl.label}` : ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Requirements tab (Task 30, user direction) — everything the
          applicant must bring: the posting's Qualifications text, the CSC
          minimum qualification requirements, and the folded Key Competency
          (Task 25/26 — the content runs a full page long, so it stays a
          dropdown). */}
      <div
        role="tabpanel"
        id="job-panel-requirements"
        aria-labelledby="job-tab-requirements"
        hidden={tab !== "requirements"}
        className="space-y-7 pt-6"
      >
        {(job.otherQualificationsHtml?.trim() || job.otherQualifications?.trim()) && (
          <div>
            <h2 className="text-base font-bold text-ink">Qualifications</h2>
            <div className="mt-2.5">
              <RichOrPlain html={job.otherQualificationsHtml} text={job.otherQualifications} />
            </div>
          </div>
        )}

        <div>
          <h2 className="text-base font-bold text-ink">Minimum Qualification Requirements</h2>
          <div className="mt-1">
            {visibleMqr.length > 0 ? (
              visibleMqr.map(([label, value], i) => (
                <div
                  key={label}
                  className={`grid gap-1 py-3.5 sm:grid-cols-[200px_1fr] sm:gap-4 ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <p className="text-sm font-medium text-ink">{label}</p>
                  <p className="text-sm leading-relaxed text-stone">{value}</p>
                </div>
              ))
            ) : (
              <p className="py-3.5 text-sm text-stone">
                No minimum requirements published for this position.
              </p>
            )}
          </div>
        </div>

        {/* Task 25/26 — Key Competency renders as a DROPDOWN: the content runs
            a full page long, so it stays folded until the reader opens it and
            never covers the rest of the requirements. */}
        {job.position?.keyCompetency?.trim() && (
          <CollapsibleSection title="Key Competency">
            <RichOrPlain html={job.position.keyCompetency} text={null} />
          </CollapsibleSection>
        )}
      </div>
    </section>
  );
}
