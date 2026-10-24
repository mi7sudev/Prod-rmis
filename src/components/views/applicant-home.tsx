"use client";

// ============================================================================
// RMIS — Applicant home ("My Application"). COMPOSITION ROOT — the view is
// assembled from the applicant/ module folder (architecture candidate ⑥, the
// operator-approved decomposition of this former 1,839-line file):
//   · applicant/journey-vocabulary — THE stage vocabulary (status → label /
//     hue / glyph / step progress / behavior; re-uses lib/status +
//     lib/status-ui single sources)
//   · applicant/journey-stepper    — the progress cards' c-stepper-7
//   · applicant/journey-card       — the §7.3 journey cards
//   · applicant/application-detail-modal — the §7.7 modal (live MQR ledger)
//   · applicant/applications-rail  — the "In Progress" rail (both copies)
//   · applicant/application-history-drawer — View All drawer + timeline
//   · applicant/home-skeleton      — loading skeleton (both breakpoints)
//   · applicant/home-hero          — desktop hero / phone banner / stat tiles
//   · applicant/mini-profile       — mini profile + completion ring
//   · applicant/bookmarked-jobs    — the desktop bookmarks list
// DESKTOP (lg+) hybrid (user directives 2026-10-20/21): the original
// [vector hero | mini profile] row is restored (same brand gradient, compact
// vector footprint, mini profile verbatim), the two stat tiles (Applications
// / Bookmarks) stay at the hero's bottom, and the standalone "Apply Now /
// Job Openings" banner is retired — its conversion copy now lives INSIDE the
// hero:
//   DESKTOP
//     · Top row — LEFT (7/12): the brand-blue opportunity hero carrying the
//       "Apply Now" eyebrow → "Job Openings" title → live open-positions
//       description → one unmistakable "View All Jobs" pill (no
//       open-positions count chip per user), the compact vector at its
//       bottom-right, and the two stat cards directly below; RIGHT (5/12):
//       the mini profile with "Your Applications · In Progress" directly
//       beneath it (moved out of the retired two-pane workspace).
//     · Bookmarked Jobs — INSIDE the hero's left column directly under the
//       stat tiles; cards are THE SAME row card the Job Opportunities board
//       uses (exported JobListCard, user directive 2026-10-21) minus the
//       quick-view dropdown; selecting a card deep-links into the board with
//       that posting preselected; gold Applied pill when an application
//       exists; bookmark toggle uses the shared client store.
//   MOBILE (<lg): compact opportunity banner carrying the SAME contents and
//   button as the desktop hero (user directive 2026-10-21) on a smaller type
//   scale with a shorter vector → profile-completion banner → Your
//   Applications list (browsing lives on the Jobs page).
// Data: parallel /api/applications + /api/jobs — 15 s silent poll + refetch on
// focus (never flips skeletons or clobbers good data on transient failure).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApplicationsIcon, BookmarksIcon } from "@/components/icons/home-card-icons";
import { ErrorCard, PageHeader } from "@/components/ui/shell";
import { apiFetch } from "@/lib/client";
import { type ApplicationWire, type DocumentWire, type JobWire } from "@/lib/router";
import { computeProfileCompletion } from "@/lib/profile-completion";
import type { ApplicantProfile } from "@/components/views/profile/section-types";
import { useSession } from "@/components/session-provider";
import { initialsOf } from "@/components/shell/nav-rail";
import { useSavedJobs } from "@/lib/use-saved-jobs";
import OnboardingTour from "@/components/onboarding-tour";
import { jobIsActive } from "@/lib/job-meta";
import { HomeSkeleton } from "@/components/views/applicant/home-skeleton";
import {
  OpportunityHero,
  MobileOpportunityBanner,
  StatCard,
} from "@/components/views/applicant/home-hero";
import { MiniProfile, PROFILE_SECTIONS } from "@/components/views/applicant/mini-profile";
import { BookmarkedJobs } from "@/components/views/applicant/bookmarked-jobs";
import { ApplicationsRail } from "@/components/views/applicant/applications-rail";
import { ApplicationDetailModal } from "@/components/views/applicant/application-detail-modal";

// ── Main view ───────────────────────────────────────────────────────────────

export default function ApplicantHome() {
  const { user } = useSession();
  const [apps, setApps] = useState<ApplicationWire[] | null>(null);
  const [jobs, setJobs] = useState<JobWire[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApplicationWire | null>(null);
  // Bookmarks — the same client store the frontpage explorer uses.
  const { saved, toggle: toggleSave } = useSavedJobs();
  const scrollToSection = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  // Profile completion ring (Task 22): 100% for free when the session says
  // complete; otherwise ONE quiet profile+documents fetch computes it. The
  // same profile GET is also the single quiet source for the mini profile's
  // Contact metric (mobile/secondary numbers). A failure just hides the
  // ring / blanks the contact line — it never owns a loading state.
  const [ringPct, setRingPct] = useState<number | null>(null);
  const [contactNo, setContactNo] = useState<string | null>(null);
  // Sections the §7.4 completion math flags as not-done (labels from
  // PROFILE_SECTIONS) — the profile tooltip's missing list.
  const [profileGaps, setProfileGaps] = useState<string[]>([]);
  // The hero pill's text-cascade beat (user directive): the "View All Jobs"
  // label re-cascades every 5 s — flipping the value re-keys ActionSwapText's
  // letter layers while the label itself never changes. Both hero copies
  // (desktop vector hero + phone banner) share the same beat.
  const [cascadeTick, setCascadeTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setCascadeTick((t) => t + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  const reload = useCallback(async (silent: boolean) => {
    try {
      const [appRes, jobRes] = await Promise.all([
        apiFetch<ApplicationWire[]>("/api/applications"),
        apiFetch<JobWire[]>("/api/jobs"),
      ]);
      setApps(appRes);
      setJobs(jobRes);
      setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Unable to load your workspace");
      // Silent failures keep the last good data (§13 polling contract).
    }
  }, []);

  useEffect(() => {
    void reload(false);
    const interval = setInterval(() => {
      if (!document.hidden) void reload(true);
    }, 15_000);
    const onFocus = () => void reload(true);
    const onVisible = () => {
      if (!document.hidden) void reload(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  const loading = apps === null && jobs === null;
  const firstName = user?.firstName || "there";
  // Mini-profile identity (restored card): full name as the primary element
  // (the initials avatar derives from the same composed name).
  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || firstName
    : firstName;
  const initials = user ? initialsOf(user) : "--";

  // Right rail — every application on record, newest first. The rail has its
  // own overflow scroll, so no cap is needed.
  const sortedApps = (apps ?? []).sort((a, b) => Date.parse(b.dateApplied) - Date.parse(a.dateApplied));

  // Open postings (deadline not passed), newest published first — the live
  // count feeds the hero's "Job Openings" description.
  const openJobs = (jobs ?? [])
    .filter((j) => jobIsActive(j.deadlineDate))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const profileComplete = user?.applicant?.isProfileComplete ?? false;

  // Bookmarked jobs that still exist in the payload, board order (newest
  // published first). Bookmarks for retired postings drop out silently.
  const savedJobs = useMemo(() => (jobs ?? []).filter((j) => saved.includes(j.id)), [jobs, saved]);

  // Jobs with an application on record — drives the board card's gold
  // "Applied" pill inside the Bookmarked Jobs list.
  const appliedJobIds = useMemo(() => new Set((apps ?? []).map((a) => a.jobId)), [apps]);

  // Ring + contact data — runs before the skeleton early-return below. The
  // profile GET always fires once (it feeds the Contact metric); documents
  // are only fetched while the ring still has to be computed (<100%).
  useEffect(() => {
    let alive = true;
    if (profileComplete) {
      setRingPct(100);
      setProfileGaps([]);
    } else {
      setRingPct(null);
    }
    void (async () => {
      try {
        const profileRes = await apiFetch<ApplicantProfile>("/api/applicant/profile");
        if (alive) setContactNo(profileRes.mobileNumber ?? profileRes.contactNumber ?? null);
        if (!profileComplete) {
          const docsRes = await apiFetch<DocumentWire[]>("/api/applicant/documents");
          const completion = computeProfileCompletion(profileRes, docsRes);
          if (alive) {
            setRingPct(completion.pct);
            setProfileGaps(PROFILE_SECTIONS.filter((_, i) => !completion.sectionDone[i]));
          }
        }
      } catch {
        if (alive) {
          setContactNo(null);
          if (!profileComplete) setRingPct(null); // ring quietly hides on failure
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [profileComplete]);

  if (loading) return <HomeSkeleton />;

  if (error && apps === null) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Applicant Portal" title="My Application" />
        <ErrorCard
          title="Couldn't load your workspace"
          description={error}
          onRetry={() => void reload(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:-mb-10">
      {/* ===== DESKTOP top row (user directives 2026-10-20/21): the
           [vector hero | mini profile] row, with the hero now carrying the
           former Apply Now banner's conversion copy — "Apply Now" eyebrow →
           "Job Openings" title → live open-positions description → the one
           unmistakable "View All Jobs" pill (the "N open positions" chip is
           intentionally dropped per user) — beside the compact vector at its
           bottom-right, and the two kept stat cards (Applications /
           Bookmarks) directly at its bottom. RIGHT (4.5/12 — narrowed from
           5/12 per user directive 2026-10-21, "decrease the width of the
           right side contents just a little"): the mini profile with "Your
           Applications · In Progress" directly beneath it (moved
           out of the retired two-pane workspace). Phones never see this row
           (hidden lg:grid) — their compact banner below is unchanged.
           The row is viewport-BOUNDED on desktop (lg:h = 100dvh − 6.5rem:
           exactly the 104px of shell above, NO bottom breathing — the row
           ends flush with the fold; FIXED height with
           a minmax(0,1fr) row track — auto tracks size to content and
           would overflow the bound — and lg:min-h-0 on both columns, so
           the flex lists can't inflate the row back to content size) and both columns
           are flex-columns whose card lists flex-fill to one SHARED bottom
           line at the fold — QA 2026-10-21 follow-up: equal max-height
           caps still left the bookmarked list ending ~144px lower (its top
           offset is larger), so "matching the caps" wasn't enough; matched
           BOTTOMS are, and both lists still breathe with the screen.
           The page wrapper's lg:-mb-10 cancels 40px of the 56px shell
           stack under the row (32px main padding-bottom + 24px shell
           main↔footer flex gap) on THIS page only, leaving a 16px
           hairline before the footer (QA 2026-10-21: "white gap before
           the footer… make it so thin").
           ============================= */}
      <div className="hidden lg:grid lg:grid-cols-[7.5fr_4.5fr] lg:grid-rows-[minmax(0,_1fr)] lg:gap-8 lg:h-[calc(100dvh_-_6.5rem)]">
        <div className="min-w-0 space-y-5 lg:col-span-1 lg:flex lg:flex-col lg:min-h-0">
          <OpportunityHero openJobsCount={openJobs.length} cascadeTick={cascadeTick} />
          {/* The two kept stat tiles at the bottom of the vector — design
              untouched from the reference pass (soft chip, caption, label,
              kebab). The Profile tile is gone; the mini profile owns
              identity + completion again. */}
          <div className="grid grid-cols-2 gap-5">
            <StatCard
              icon={ApplicationsIcon}
              tone="plum"
              caption={`${sortedApps.length} submitted`}
              label="Applications"
              onClick={() => scrollToSection("applications")}
            />
            <StatCard
              icon={BookmarksIcon}
              tone="rose"
              caption={`${savedJobs.length} saved`}
              label="Bookmarks"
              onClick={() => scrollToSection("bookmarked-jobs")}
            />
          </div>
          {/* ===== Bookmarked Jobs (desktop) — INSIDE the hero's left
              column, directly under the stat tiles (the section itself
              lives in applicant/bookmarked-jobs). Selecting a card
              deep-links into the board with that posting preselected
              (#/job-opportunities?job=<id>). Vertical list, height-MATCHED
              with the applications rail (QA 2026-10-21 follow-up: "the
              bookmarked jobs is much taller" — both lists had the SAME
              100dvh − 13.5rem cap, but this list starts ~144px lower under
              the hero, so its bottom hung that much below the rail's): the
              hero row is viewport-bounded (lg:h = 100dvh − 6.5rem) and this
              list flex-fills its column, so BOTH lists end on one visible
              shared line near the fold and grow/shrink with the user's
              screen height. Phones never see it — their compact banner →
              applications flow is unchanged.
              ========================================================== */}
          <BookmarkedJobs
            savedJobs={savedJobs}
            saved={saved}
            appliedJobIds={appliedJobIds}
            onToggleSave={toggleSave}
          />
        </div>
        {/* RIGHT (4.5/12 — narrowed from 5/12 per user directive) — the mini
            profile with "Your Applications · In Progress" directly beneath it
            (user directive: the rail moved out of the retired two-pane
            workspace; the card itself lives in applicant/mini-profile). */}
        <div className="min-w-0 space-y-5 lg:col-span-1 lg:flex lg:flex-col lg:min-h-0">
          <MiniProfile
            user={user}
            displayName={displayName}
            initials={initials}
            profileComplete={profileComplete}
            ringPct={ringPct}
            contactNo={contactNo}
            profileGaps={profileGaps}
          />
          {/* The moved rail — right here, under the profile (user directive). */}
          <ApplicationsRail apps={sortedApps} onOpen={setDetail} domId="applications" titleId="applications-title" />
        </div>
      </div>
      {/* ===== MOBILE-ONLY opportunity banner — the phone twin of the desktop
           hero (the section itself lives in applicant/home-hero). Phones
           keep their existing flow here: compact banner → this list. The
           "Complete Your Profile" banner is RETIRED (QA 2026-10-21, user
           directive) — the mini profile's completion ring + metric are the
           one remaining nudge, and the onboarding tour's profile step was
           removed with it. ============= */}
      <MobileOpportunityBanner openJobsCount={openJobs.length} cascadeTick={cascadeTick} />

      {/* ===== MOBILE · Your Applications — the desktop rail now lives
           directly under the mini profile (inside the lg-only top row), so
           phones keep their existing flow here: compact banner → profile
           banner → this list (same journey cards, detail modal on click,
           Cancel Application while Submitted). No ids here — the DOM ids,
           tour anchor and StatCard scroll target all belong to the desktop
           copy. ============= */}
      <div className="lg:hidden">
        <ApplicationsRail apps={sortedApps} onOpen={setDetail} />
      </div>

      {detail && (
        <ApplicationDetailModal
          application={detail}
          onClose={() => setDetail(null)}
          onCancelled={() => {
            setDetail(null);
            void reload(true);
          }}
        />
      )}

      {/* QA 2026-02 — Guided tooltips for first-time users: proceed with the
          tutorial or dismiss/skip it (remembered per browser). */}
      <OnboardingTour
        storageKey="rmis.tour.applicant.v1"
        title="Welcome to the Applicant Portal"
        description="This quick guided tour points out the essentials: finish your profile, apply to vacancies, and track where you stand. You can skip it anytime."
        steps={[
          {
            selector: '[data-tour="apply-now"]',
            title: "Apply Now",
            body: "Every open vacancy is one tap away — open the Job Openings board to read the full description and apply; your profile carries over.",
          },
          {
            selector: '[data-tour="my-applications"]',
            title: "Track your applications",
            body: "Every application you submit appears here with its live stage: from qualification screening to shortlisting, exams, and interviews.",
          },
        ]}
      />
    </div>
  );
}
