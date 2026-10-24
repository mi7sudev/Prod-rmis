"use client";

// ============================================================================
// RMIS — Applicant home hero pieces: the desktop (lg+) "Job Openings"
// opportunity hero, the phones' compact twin banner, and the Applications /
// Bookmarks stat tiles. Extracted verbatim from applicant-home.tsx
// (architecture candidate ⑥). The two hero copies carry the SAME contents
// and CTA on a smaller mobile type scale (user directives 2026-10-20/21) —
// the desktop anatomy is flex row + side vector, the phone stack flows full
// card width; both stay byte-identical to their originals.
// ============================================================================

import type { ComponentType, CSSProperties } from "react";
import { ArrowRight, MoreVertical } from "lucide-react";
import { IconChip, type ChipTone } from "@/components/ui/shell";
import { navigate } from "@/lib/router";
import { ActionSwapText } from "@/components/beui/action-swap";

/** Reference stat tile — soft chip, muted caption, bold label, kebab.
 *  The chip glyph is the user's duotone card art (ApplicationsIcon /
 *  BookmarksIcon) — any SVG component that draws with currentColor fits. */
export function StatCard({
  icon,
  tone,
  caption,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  tone: ChipTone;
  caption: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dlg-card focus-ring flex items-center gap-3 rounded-2xl p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
    >
      <IconChip icon={icon} tone={tone} size={44} iconSize={24} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-stone">{caption}</span>
        <span className="block truncate font-display text-[15px] font-medium text-ink">{label}</span>
      </span>
      <MoreVertical aria-hidden="true" className="h-4 w-4 shrink-0 text-ash" />
    </button>
  );
}

/** DESKTOP (lg+) opportunity hero — the brand-blue conversion card carrying
 *  the "Apply Now" eyebrow → "Job Openings" title → live open-positions
 *  description → one unmistakable "View All Jobs" pill (no open-positions
 *  count chip per user), the compact vector at its bottom-right, and — in
 *  the caller's column, directly below — the two stat cards. */
export function OpportunityHero({ openJobsCount, cascadeTick }: { openJobsCount: number; cascadeTick: number }) {
  return (
    <section
      data-tour="apply-now"
      aria-labelledby="job-openings-title"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1591dc] via-[#1180c4] to-[#0b6fa8] p-6 xl:p-7"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 right-64 h-32 w-32 rounded-full border-[6px] border-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-white/[0.07]" />
      <div className="relative flex h-full items-end gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/75">
            Apply Now
          </p>
          <h2 id="job-openings-title" className="mt-2 font-display text-2xl font-medium leading-tight text-white xl:text-3xl">
            Job Openings
          </h2>
          <p className="mt-2.5 max-w-lg text-sm leading-relaxed text-white/85">
            {openJobsCount} {openJobsCount === 1 ? "position is" : "positions are"} open across
            DOST-MIRDC. Find the one that fits you and apply in minutes.
          </p>
          <button
            type="button"
            onClick={() => navigate("job-opportunities")}
            className="focus-ring group mt-5 inline-flex min-h-[48px] items-center gap-3 rounded-full bg-[#ffffff] py-1.5 pl-6 pr-1.5 text-sm font-semibold text-[#0b6fa8] shadow-lg shadow-[#083b5b]/25 transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            {/* The label re-cascades every 5 s (beui text-cascade letter
                roll — user directive) while always reading the same. */}
            <ActionSwapText value={`cascade-${cascadeTick}`} animation="cascade">
              View All Jobs
            </ActionSwapText>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#0b6fa8] text-white transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </button>
        </div>
        <img
          src="/home-banner-vector.png"
          alt=""
          aria-hidden="true"
          className="-mb-6 h-28 w-auto shrink-0 lg:h-32 xl:h-36 2xl:h-40"
        />
      </div>
    </section>
  );
}

/** MOBILE-ONLY opportunity banner — the phone twin of the desktop hero (user
 *  directive 2026-10-21): the SAME content stack and CTA on a smaller type
 *  scale with a shorter vector. Follow-up directive (same day): the "— your
 *  profile carries over." clause is GONE from both views, the art grows
 *  (h-18 → h-22) while the CARD gets SHORTER — tighter padding (p-4), snug
 *  13px body over two lines, and a compressed rhythm — so the phone banner
 *  reads as a compact infographic with a dominant flush bottom-right vector.
 *  Copy flows FULL card width (eyebrow/title/description, then the pill
 *  sharing the bottom row with the art) so the description never squeezes
 *  into a narrow side column. Below 360px the art steps down to h-14 and the
 *  row gap tightens so nothing clips past the rounded edge at 320px. Brand
 *  gradient + decorative rings unchanged; theme-stable. */
export function MobileOpportunityBanner({ openJobsCount, cascadeTick }: { openJobsCount: number; cascadeTick: number }) {
  return (
    <section
      aria-label="Explore job opportunities"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1591dc] via-[#1180c4] to-[#0b6fa8] p-4 lg:hidden"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 right-24 h-32 w-32 rounded-full border-[6px] border-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-white/[0.07]" />
      <div className="relative">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/75">
          Apply Now
        </p>
        <h2 className="mt-1 font-display text-xl font-medium leading-tight text-white">
          Job Openings
        </h2>
        <p className="mt-1.5 max-w-lg text-[13px] leading-snug text-white/85">
          {openJobsCount} {openJobsCount === 1 ? "position is" : "positions are"} open across
          DOST-MIRDC. Find the one that fits you and apply in minutes.
        </p>
        <div className="mt-3 flex items-end justify-between gap-3 max-[359px]:gap-2">
          <button
            type="button"
            onClick={() => navigate("job-opportunities")}
            className="focus-ring group inline-flex min-h-[44px] shrink-0 items-center gap-2.5 rounded-full bg-[#ffffff] py-1 pl-5 pr-1 text-sm font-semibold text-[#0b6fa8] shadow-lg shadow-[#083b5b]/25 transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            {/* Same 5 s cascade beat as the desktop hero (shared tick). */}
            <ActionSwapText value={`cascade-${cascadeTick}`} animation="cascade">
              View All Jobs
            </ActionSwapText>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#0b6fa8] text-white transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </button>
          <img
            src="/home-banner-vector.png"
            alt=""
            aria-hidden="true"
            className="-mb-4 h-22 w-auto shrink-0 max-[359px]:h-14"
          />
        </div>
      </div>
    </section>
  );
}
