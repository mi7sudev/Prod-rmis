"use client";

// ============================================================================
// RMIS — Desktop mini profile card (identity row + verified chip + Profile
// Setup tooltip + Contact/completion-ring metric strip) with the §7.4
// CompletionRing. Extracted verbatim from applicant-home.tsx (architecture
// candidate ⑥).
// ============================================================================

import { ArrowRight, BadgeCheck, Info, Mail, Phone } from "lucide-react";
import { Badge } from "@/components/reui/badge";
import { navigate, type SessionUser } from "@/lib/router";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** §7.4 section labels in computeProfileCompletion's fixed sectionDone order
 *  — drives the mini profile tooltip's "what's missing" list. */
export const PROFILE_SECTIONS = [
  "Personal information",
  "Education",
  "Work experience",
  "Training",
  "Eligibility",
  "Awards",
  "Documents",
];

/** Circular completion ring — a small, elegant SOLID Metric-Blue arc on a
 *  divider track (restored with the mini profile: no gradient, no glow, and
 *  NO inner readout — the percentage is displayed exactly once, as the
 *  metric value beside the ring). Fixed h-8 size so it sits flush inside
 *  the compact metrics strip. */
function CompletionRing({ pct, className }: { pct: number; className?: string }) {
  const R = 30;
  const C = 2 * Math.PI * R;
  return (
    <div
      className={cn("relative h-8 w-8 shrink-0", className)}
      role="img"
      aria-label={`${pct}% profile complete`}
    >
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <circle cx="36" cy="36" r={R} fill="none" className="stroke-divider" strokeWidth="6" />
        {pct > 0 && (
          <circle
            cx="36"
            cy="36"
            r={R}
            fill="none"
            className="stroke-metric-blue motion-safe:transition-[stroke-dasharray] duration-700 ease-out"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * C} ${C}`}
          />
        )}
      </svg>
    </div>
  );
}

/** Mini profile (Task 24/27 card): hero-sky wash inside a bordered
 *  rounded-2xl surface, compact identity row (initials avatar + verified
 *  chip, name + Applicant badge, email), the desktop-only Profile Setup
 *  tooltip (the Edit Profile capsule's replacement), and the divider-free
 *  metric strip (Contact · completion ring — the redundant Email metric was
 *  removed per user direction, the address line under the name owns it). */
export function MiniProfile({
  user,
  displayName,
  initials,
  profileComplete,
  ringPct,
  contactNo,
  profileGaps,
}: {
  user: SessionUser | null;
  displayName: string;
  initials: string;
  profileComplete: boolean;
  ringPct: number | null;
  contactNo: string | null;
  profileGaps: string[];
}) {
  return (
    <section aria-label="Mini profile" className="hero-sky rounded-2xl border border-divider px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="relative shrink-0">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-ink text-sm font-medium text-white ring-1 ring-divider sm:h-14 sm:w-14 sm:text-base">
            {initials}
          </span>
          {profileComplete && (
            <span
              className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-white ring-1 ring-divider"
              title="Profile complete"
            >
              <BadgeCheck className="h-3.5 w-3.5 text-ok" aria-hidden="true" />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="font-display truncate text-lg font-medium text-ink sm:text-xl">
              {displayName}
            </h1>
            <span className="dlg-pill shrink-0 bg-cloud px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-stone">
              {user?.role ?? "APPLICANT"}
            </span>
          </div>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] leading-snug text-stone">
            <Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ash" />
            <span className="truncate">{user?.email}</span>
          </p>
        </div>
        {/* Profile Setup tooltip (user directive) — replaces the retired
            Edit Profile capsule: the reui c-tooltip-5 pattern (info
            icon + count badge → rich content card with a section list
            and a link), re-voiced as the profile-completion nudge.
            Desktop-only like the capsule it replaced — the phone's
            Profile tab in the bottom bar is the direct path. Trigger
            wears the drawer-close button's round hairline anatomy; the
            card sits on the ui/tooltip popover recipe (hover = preview,
            click = go). Task 43 — the WHOLE trigger disappears once the
            profile is complete (nothing left to nudge — the ring metric
            below already reads Complete), and the card's type runs a
            scale smaller (header 14px, list + link 12px — they used to
            inherit the 16px root size). */}
        {!profileComplete && (
        <TooltipProvider delayDuration={120}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => navigate("profile")}
                aria-label="Profile setup"
                className="focus-ring relative hidden size-9 shrink-0 place-items-center rounded-full border border-divider bg-background text-stone transition-colors hover:bg-fog hover:text-ink lg:grid"
              >
                <Info className="h-4 w-4" aria-hidden="true" />
                {!profileComplete && ringPct !== null && (
                  <Badge
                    variant="destructive"
                    size="sm"
                    className="absolute -right-2 -top-2 h-4 min-w-4 px-1"
                  >
                    {ringPct}%
                  </Badge>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="w-64 p-3">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">Profile Setup</span>
                  {profileComplete ? (
                    <Badge variant="success" size="sm">Complete</Badge>
                  ) : (
                    <Badge variant="destructive" size="sm">{ringPct ?? 0}% done</Badge>
                  )}
                </div>
                <div className="flex flex-col gap-1 text-xs text-stone opacity-80">
                  {profileComplete ? (
                    <p>Your profile has everything recruiters need — you're all set.</p>
                  ) : profileGaps.length > 0 ? (
                    profileGaps.map((gap) => <p key={gap}>• {gap} — incomplete</p>)
                  ) : (
                    <p>Finish your profile so recruiters can match you faster.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => navigate("profile")}
                  className="flex items-center gap-1 text-left text-xs font-medium text-primary underline underline-offset-2"
                >
                  {profileComplete ? "Go to profile" : "Complete profile"}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        )}
      </div>
      {/* Metric strip — bare muted icon, value over label; the ring is
          the second item and its percentage appears once (as the value).
          Per user directive 2026-10-21 the first metric is the
          applicant's Contact info; the redundant Email metric was
          dropped (Task 27) — the email already shows under the name,
          so the strip reads Contact · Profile completion. */}
      <dl className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 sm:mt-5 sm:gap-x-12">
        <div className="flex min-w-0 items-center gap-2.5">
          <Phone aria-hidden="true" className="h-4 w-4 shrink-0 text-ash" />
          <div className="flex min-w-0 flex-col">
            <dt className="order-2 truncate text-[11px] leading-tight text-stone">Contact</dt>
            <dd className="order-1 truncate font-display text-sm font-medium leading-tight text-ink">
              {contactNo ?? "Not provided"}
            </dd>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2.5">
          {ringPct !== null ? (
            <CompletionRing pct={ringPct} />
          ) : (
            <BadgeCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-ash" />
          )}
          <div className="flex min-w-0 flex-col">
            <dt
              className={cn(
                "order-2 truncate text-[11px] font-medium leading-tight",
                profileComplete ? "text-ok" : "text-warn"
              )}
            >
              <span className="sm:hidden">{profileComplete ? "Complete" : "In progress"}</span>
              <span className="hidden sm:inline">
                Profile {profileComplete ? "complete" : "in progress"}
              </span>
            </dt>
            <dd className="num order-1 font-display text-sm font-medium leading-tight text-ink">
              {ringPct !== null ? `${ringPct}%` : profileComplete ? "Complete" : "In progress"}
            </dd>
          </div>
        </div>
      </dl>
    </section>
  );
}
