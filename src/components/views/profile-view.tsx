"use client";

// ============================================================================
// RMIS — Profile builder (Bevel edition, CREDENTIALS-FIRST per user):
// the page IS the 7-section FORM WORKFLOW — no identity header at all
// (Task 22: the slim strip was removed too; the completion ring lives in the
// Home mini profile and the identity surface is gone with it). While the
// record is incomplete, a quiet foot row above the optional PDS import
// carries the completion note + Mark Complete CTA. PDS auto-fill stays a
// demoted OPTIONAL collapsible at the very foot (manual form filling is
// the primary path; auto-fill is a shortcut).
// Section navigation is breakpoint-split (QA 2026-02 + merged wizard per
// user): lg+ renders ONE merged wizard card — header row (back circle, title,
// subtitle) over a two-column body: the Profile Progress rail LEFT (caption,
// fraction bar, the ReUI c-stepper-44 stepper — a continuous connector rail
// with dashed pending rings, green completed checks, a spinning active ring,
// and Personal Information's four sub-part tasks (Identity / Address / Legal
// Disclosures / Character References) nested under the active phase — the
// tasks SWITCH the form: only the selected sub-part renders in the panel —
// and the bordered form panel RIGHT with the active
// section rendered chrome-less inside it and a pinned tinted action bar
// (outline Back / primary Continue) at its foot (the .profile-wizard rules
// in globals.css flatten the SectionCard chrome inside the panel). Phones
// keep the compact iOS-style strip — a sticky rounded white card holding the
// 7 status cells (sliding brand-blue thumb) over a prev/next caption bar —
// plus the page-level footer row.
// Data logic unchanged: parallel loads, silent reloads, session refresh.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "@/lib/toast";
import {
  ArrowLeft,
  BadgeCheck,
  BookUser,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDashed,
  FileUp,
  GraduationCap,
  Info,
  Presentation,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperTitle,
  StepperTrigger,
} from "@/components/reui/stepper";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ErrorCard, SkeletonRows } from "@/components/ui/shell";
import { cancelBtn, ghostBadBtn } from "@/components/ui/buttons";
import { apiFetch } from "@/lib/client";
import { computeProfileCompletion } from "@/lib/profile-completion";
import { useSession } from "@/components/session-provider";
import { navigate } from "@/lib/router";
import type { DocumentWire } from "@/lib/router";
import { cn } from "@/lib/utils";
import PdsUploadCard from "./profile/pds-upload-card";
import PersonalInfoSection, { PI_SUBS, type PiSub } from "./profile/personal-info-section";
import EducationSection from "./profile/education-section";
import WorkExperienceSection from "./profile/work-experience-section";
import TrainingSection from "./profile/training-section";
import EligibilitySection from "./profile/eligibility-section";
import AwardsSection from "./profile/awards-section";
import DocumentsSection from "./profile/documents-section";
import OnboardingTour from "@/components/onboarding-tour";
import { useIsBelowLg } from "@/hooks/use-below-lg";
import type { ApplicantProfile, ReferenceData } from "./profile/section-types";

const SECTIONS: {
  n: number;
  num: string;
  label: string;
  short: string;
  minutes: number | null;
  icon: LucideIcon;
}[] = [
  { n: 1, num: "01", label: "Personal Information", short: "Personal", minutes: 8, icon: BookUser },
  { n: 2, num: "02", label: "Education", short: "Education", minutes: 3, icon: GraduationCap },
  { n: 3, num: "03", label: "Work Experience", short: "Work", minutes: 5, icon: BriefcaseBusiness },
  { n: 4, num: "04", label: "Training", short: "Training", minutes: 2, icon: Presentation },
  { n: 5, num: "05", label: "Eligibility", short: "Eligibility", minutes: 3, icon: BadgeCheck },
  { n: 6, num: "06", label: "Awards", short: "Awards", minutes: 2, icon: Trophy },
  { n: 7, num: "07", label: "Supporting Documents", short: "Documents", minutes: null as number | null, icon: FileUp },
];

// ── ReUI c-stepper-44 indicator nodes (pattern port on RMIS tokens) ─────────
// The design draws its icons with a 1.2px line: 2.88 on the 24-unit grid of
// the 10px check, 1.44 on the dashed circle — `*:stroke-*` repeats the weight
// on the paths so it holds where a wrapper drops the prop. Completed rings
// ride the soft success token, pending is the dashed circle, and active spins
// a conic-masked arc (inline mask styles — deterministic, no Tailwind
// mask-utility dependency) over the dashed track.

function PhaseCompleted({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full border border-success bg-success/10 text-success",
        className
      )}
    >
      <Check strokeWidth={2.88} className="size-2.5 *:stroke-[2.88]" aria-hidden="true" />
    </span>
  );
}

function PhasePending({ className }: { className?: string }) {
  return (
    <CircleDashed
      strokeWidth={1.44}
      className={cn("text-ring/60 *:stroke-[1.44]", className)}
      aria-hidden="true"
    />
  );
}

function PhaseRunning({
  className,
  trackMask,
  arcMask,
}: {
  className?: string;
  /** Repeating conic mask that cuts the track into dashes. */
  trackMask: string;
  /** Conic mask that keeps a single spinning arc of the drawn sweep. */
  arcMask: string;
}) {
  return (
    <span className={cn("relative block", className)}>
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full border-[1.2px] border-ring/60"
        style={{ maskImage: trackMask, WebkitMaskImage: trackMask }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full border-[1.2px] border-primary motion-safe:animate-spin"
        style={{ maskImage: arcMask, WebkitMaskImage: arcMask }}
      />
    </span>
  );
}

// 16 dashes fit the 22px phase ring and 9 the 13px task ring; each arc keeps
// its drawn sweep.
const PHASE_RINGS = {
  completed: <PhaseCompleted className="size-5" />,
  inactive: <PhasePending className="size-5" />,
  loading: (
    <PhaseRunning
      className="size-5.5"
      trackMask="repeating-conic-gradient(#000 0 16.875deg, transparent 0 22.5deg)"
      arcMask="conic-gradient(from -17deg, #000 152deg, transparent 0)"
    />
  ),
};

const TASK_TRACK_MASK = "repeating-conic-gradient(#000 0 30deg, transparent 0 40deg)";
const TASK_ARC_MASK = "conic-gradient(from -28deg, #000 140deg, transparent 0)";

// MOM — Personal Information's sub-parts come from the section module
// (PI_SUBS): the nested task list under the active phase SWITCHES the form
// (only the selected sub-part renders in the panel — user request; the old
// scroll-jump-to-disclosure-group behavior is retired) and each ring reads
// from the SAVED record, like the phase rings themselves.

export default function ProfileView() {
  const { refresh } = useSession();
  const sectionsRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<ApplicantProfile | null>(null);
  const [reference, setReference] = useState<ReferenceData | null>(null);
  const [docs, setDocs] = useState<DocumentWire[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(1);
  const [seed, setSeed] = useState(0);
  const [markOpen, setMarkOpen] = useState(false);
  const [marking, setMarking] = useState(false);

  // Task 40 — unsaved-changes guard. PersonalInfoSection (the only section
  // with a live edit session) reports (editing && dirty) upward; any
  // navigation out of section 01 while the flag is up is confirmed BEFORE
  // the section unmounts and drops the draft. pendingNav holds the
  // destination (a section number, or "home" for Return to Portal) until
  // the applicant chooses.
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const handleUnsavedChange = useCallback((u: boolean) => setHasUnsaved(u), []);
  const [pendingNav, setPendingNav] = useState<number | "home" | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  // MOM 2026-10-13 — Character References are REQUIRED before the Education
  // section: derived from the SAVED profile (never the in-progress draft),
  // so the forward-navigation gate lifts the moment a save lands.
  const hasCharacterReference = (profile?.characterReferences ?? []).some(
    (r) => typeof r?.name === "string" && r.name.trim() !== ""
  );

  // PI sub-part rings read the SAVED record — the same source of truth as
  // sectionDone (the phase rings). Identity tracks the completion spec's
  // required identity fields; Address accepts the full one-liner or the
  // structured city + province pair; the Legal Disclosures Yes/No questions
  // always read answered (only the conditional detail fields can be missing);
  // Character References mirror the Education gate (≥ 1 named row).
  const strFilled = (v: string | null | undefined) => (v ?? "").trim() !== "";
  const piSubDone: boolean[] = [
    strFilled(profile?.firstName) &&
      strFilled(profile?.lastName) &&
      strFilled(profile?.emailAddress) &&
      strFilled(profile?.mobileNumber),
    strFilled(profile?.presentAddress) ||
      (strFilled(profile?.city) && strFilled(profile?.province)),
    (!profile?.adminCase || strFilled(profile?.adminCaseDetails)) &&
      (!profile?.crimeCharge || (strFilled(profile?.crimeDate) && strFilled(profile?.crimeCaseStatus))),
    hasCharacterReference,
  ];

  // MOM sub-parts — Personal Information renders ONE sub-part's form at a
  // time (user request). The rail tasks (lg+) and the section's pill row
  // (< lg) both drive this state; the draft lives inside the mounted
  // PersonalInfoSection, so switching sub-parts never drops unsaved edits —
  // only LEAVING section 01 hits the unsaved-changes guard.
  const [piSub, setPiSub] = useState<PiSub>("identity");
  const piSubIdx = PI_SUBS.findIndex((s) => s.id === piSub);

  /** Bring the form panel's top edge back into view after a sub-part swap.
   *  Section 01 renders at natural height (no internal scroll), so the PAGE
   *  scroller is what moves — the same scroller-walk as changeSection (the
   *  shell's PullToRefresh container below lg, window fallback), with the
   *  pinned strip's height as the offset on phones. */
  function scrollPanelTop() {
    const panel = sectionsRef.current?.parentElement;
    if (!panel || typeof window === "undefined") return;
    let scroller: HTMLElement | null = panel.parentElement;
    while (scroller && scroller !== document.body) {
      const oy = getComputedStyle(scroller).overflowY;
      if (oy === "auto" || oy === "scroll") break;
      scroller = scroller.parentElement;
    }
    const inContainer = !!scroller && scroller !== document.body;
    // Below lg the sticky section strip (~64px) would cover the panel top.
    const offset = window.innerWidth < 1024 ? 80 : 12;
    const top =
      panel.getBoundingClientRect().top -
      (inContainer ? scroller!.getBoundingClientRect().top : 0) +
      (inContainer ? scroller!.scrollTop : window.scrollY) -
      offset;
    const target = Math.max(0, top);
    if (inContainer) scroller!.scrollTo({ top: target, behavior: "instant" });
    else window.scrollTo({ top: target, behavior: "instant" });
  }

  /** Rail task / pill click — SWITCH the visible sub-part. */
  function selectPiSub(id: PiSub) {
    if (active !== 1) {
      // The tasks only render while the phase is active, but a stale event
      // (or a11y traversal of the collapsed list) must first land on section
      // 01 — no unsaved edits can exist there, so the gate is a no-op.
      requestSection(1);
    } else if (id === piSub) {
      return;
    }
    setPiSub(id);
    // One frame so React commits the swapped form, then reset BOTH scrolls —
    // the bounded panel's internal scrollbar and the page — so the swapped
    // sub-part always opens at its own top edge.
    requestAnimationFrame(() => {
      sectionsRef.current?.scrollTo({ top: 0 });
      scrollPanelTop();
    });
  }

  const loadAll = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    try {
      const [profileRes, docsRes] = await Promise.all([
        apiFetch<ApplicantProfile>("/api/applicant/profile"),
        apiFetch<DocumentWire[]>("/api/applicant/documents"),
      ]);
      setProfile(profileRes);
      setDocs(docsRes);
      setError(null);
      // Task 63 — keep the SESSION's server-computed isProfileComplete in
      // step with saves (the apply gate in apply-dialogs and the Home
      // profile ring read the session, not this view's local state).
      // refresh() is a silent hardRefresh — it never flips the boot
      // `loading`, so the view never unmounts mid-edit.
      void refresh();
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Unable to load your profile");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    void (async () => {
      try {
        const ref = await apiFetch<ReferenceData>("/api/reference");
        setReference(ref);
      } catch {
        // Reference data is optional (datalist/eligibility suggestions).
      }
      await loadAll(false);
    })();
  }, [loadAll]);

  const reloadSilent = useCallback(async () => {
    await loadAll(true);
  }, [loadAll]);

  /** After PDS auto-apply / clear: reload AND re-seed the personal form. */
  const onProfileReplaced = useCallback(async () => {
    await loadAll(true);
    setSeed((s) => s + 1);
  }, [loadAll]);

  // ── Completeness (§7.4) — shared math with the Home mini-profile ring ─────
  const { sectionDone, isComplete, canMarkComplete } = computeProfileCompletion(profile, docs);

  // Task 88 — "all 7 sections done" nudge trigger: the user-visible check
  // marks and this flag share the SAME sectionDone math, so the tour can
  // never fire while any step still shows an empty circle.
  const allSectionsDone = sectionDone.every(Boolean);

  // One-frame gate for the nudge mount: OnboardingTour's activation effect
  // fires on mount, BEFORE the parent's useIsBelowLg effect settles (child
  // effects run first). Mounting the tour on the same paint as a viewport-
  // dependent steps array could evaluate the wrong branch (desktop step on
  // a phone) and let the Task-20 skip logic finish the tour before it ever
  // showed. One animation frame guarantees the breakpoint is resolved.
  const [nudgeReady, setNudgeReady] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setNudgeReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const isBelowLg = useIsBelowLg();

  // Courtesy gate — never stack two tours. The one-time PDS walkthrough
  // (rmis.tour.profile.v1) and this nudge can theoretically be pending on
  // the same visit (fresh browser + an all-sections-done profile). The
  // nudge waits until that tour has been dismissed/skipped — checked
  // immediately, then polled briefly so a "Start the guided tour" click
  // resolves without a reload. If storage is unavailable the nudge
  // degrades to showing right away.
  const [otherTourSettled, setOtherTourSettled] = useState(false);
  useEffect(() => {
    if (!allSectionsDone || isComplete) return;
    let cancelled = false;
    const check = () => {
      if (cancelled) return true;
      try {
        if (!window.localStorage.getItem("rmis.tour.profile.v1")) return false;
      } catch {
        /* storage unavailable — don't block the nudge */
      }
      setOtherTourSettled(true);
      return true;
    };
    if (check()) return;
    const id = window.setInterval(() => {
      if (check()) window.clearInterval(id);
    }, 500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [allSectionsDone, isComplete]);

  const markComplete = async () => {
    setMarking(true);
    try {
      await apiFetch("/api/applicant/profile", { method: "PUT", body: { isProfileComplete: true } });
      toast.success("Profile marked as complete", {
        description: "You can now apply to open positions. HR verifies your credentials at the next stage.",
      });
      setMarkOpen(false);
      await refresh();
      await reloadSilent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to mark your profile complete");
    } finally {
      setMarking(false);
    }
  };

  // ── Mobile stepper: switch section AND bring the rail back into view —
  // tapping "04" while stranded deep inside section 01's long form must not
  // leave the viewport mid-scroll in the old section. Desktop (lg+) skips
  // this: the nav rail is sticky beside the content, no jump needed.
  const mobileNavRef = useRef<HTMLElement>(null);

  function changeSection(n: number) {
    if (n === active) return;
    setActive(n);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      // The strip lives ABOVE the swapped section content, so its document
      // position is layout-stable across the swap — unlike the wrapper's.
      // Double rAF lets React commit the new section first, then we jump
      // INSTANTLY (smooth is canceled by Chrome's scroll-anchoring yank,
      // which fires while the tall section replaces the short one and
      // re-anchors the viewport to keep the old bottom edge in view). The
      // instant jump lands the pinned strip right under the top bar; the
      // 200ms content fade masks the transition.
      // Task 34-b — the workspace page no longer scrolls the WINDOW below
      // lg: the official PullToRefresh container in the app shell is the
      // scroller (window.scrollY is always 0 there). So the jump targets
      // the strip's nearest scrollable ancestor and lands it at that
      // scrollport's top — where the strip (sticky top-0) pins right under
      // the mobile top bar. The window path stays as the fallback for any
      // layout without the container.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = mobileNavRef.current;
          if (!el) return;
          let scroller: HTMLElement | null = el.parentElement;
          while (scroller && scroller !== document.body) {
            const oy = getComputedStyle(scroller).overflowY;
            if (oy === "auto" || oy === "scroll") break;
            scroller = scroller.parentElement;
          }
          if (scroller && scroller !== document.body) {
            const top =
              el.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top +
              scroller.scrollTop;
            scroller.scrollTo({ top: Math.max(0, top), behavior: "instant" });
          } else {
            const top = el.getBoundingClientRect().top + window.scrollY - 72;
            window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
          }
        });
      });
    }
  }

  // Task 40 — guarded navigation: while section 01 holds unsaved edits,
  // every section switch / portal exit routes through the confirm dialog
  // (pendingNav remembers the destination the applicant asked for).
  // MOM 2026-10-13 — the Character Reference section is REQUIRED before
  // proceeding to the Education section: forward moves past section 01 are
  // blocked while the SAVED profile has no named character reference (the
  // applicant is pointed back to Edit Profile → Character References).
  function requestSection(n: number) {
    if (n === active) return;
    if (n > 1 && active <= 1 && !hasCharacterReference) {
      toast.error("Add at least one Character Reference before proceeding to the Education section.", {
        description: "Open Edit Profile in Personal Information and fill the Character References section (required).",
      });
      return;
    }
    if (hasUnsaved) {
      setPendingNav(n);
      setNavOpen(true);
      return;
    }
    changeSection(n);
  }

  function requestPortalExit() {
    if (hasUnsaved) {
      setPendingNav("home");
      setNavOpen(true);
      return;
    }
    navigate("home");
  }

  function confirmLeave() {
    setNavOpen(false);
    const dest = pendingNav;
    setPendingNav(null);
    setHasUnsaved(false); // the section unmounts below; keep the flag in sync
    if (dest === "home") navigate("home");
    else if (dest != null) changeSection(dest);
  }

  // Index of the active section — drives the mobile caption + prev/next.
  const activeIdx = Math.max(
    0,
    SECTIONS.findIndex((s) => s.n === active)
  );

  // ── Sub-part-aware stepping (user request): while section 01 is open,
  // Back/Continue move through Identity → Address → Legal Disclosures →
  // Character References BEFORE leaving for Education — only the selected
  // sub-part's form is on screen, so the wizard buttons must follow the
  // same path. Stepping WITHIN section 01 never triggers the unsaved-changes
  // guard (the draft survives the swap); leaving PI routes through
  // requestSection's gates (character-reference requirement + dialog).
  const backTarget =
    active === 1
      ? piSubIdx > 0
        ? PI_SUBS[piSubIdx - 1].label
        : null
      : activeIdx > 0
        ? SECTIONS[activeIdx - 1]?.label ?? null
        : null;
  const forwardTarget =
    active === 1
      ? piSubIdx < PI_SUBS.length - 1
        ? PI_SUBS[piSubIdx + 1].label
        : SECTIONS[1]?.label ?? "Education"
      : activeIdx < SECTIONS.length - 1
        ? SECTIONS[activeIdx + 1]?.label ?? null
        : null;

  function requestStepBack() {
    if (active === 1) {
      if (piSubIdx > 0) selectPiSub(PI_SUBS[piSubIdx - 1].id);
      return;
    }
    if (activeIdx > 0) requestSection(SECTIONS[activeIdx - 1].n);
  }

  function requestStepForward() {
    if (active === 1) {
      if (piSubIdx < PI_SUBS.length - 1) {
        selectPiSub(PI_SUBS[piSubIdx + 1].id);
        return;
      }
      requestSection(2); // out of Personal Information — the gates apply
      return;
    }
    if (activeIdx < SECTIONS.length - 1) requestSection(SECTIONS[activeIdx + 1].n);
  }

  // The section content column is a bounded scroll container (min/max height
  // with an internal scrollbar), so every freshly-swapped section must land
  // at its own top — otherwise switching from a short into a tall section
  // inherits the previous section's inner scroll offset.
  useEffect(() => {
    sectionsRef.current?.scrollTo({ top: 0 });
  }, [active]);

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        {/* Section skeleton — same merged-wizard geometry as the loaded
            view: ONE card holding header, Profile Progress rail LEFT (lg+)
            and form rows RIGHT; below lg the wrapper is inert. */}
        <div className="profile-wizard">
          <div
            className="hidden items-center gap-4 border-b border-divider/60 px-8 py-6 lg:flex"
            aria-hidden="true"
          >
            <div className="skel size-10 shrink-0 rounded-full" />
            <div className="space-y-2">
              <div className="skel h-5 w-40" />
              <div className="skel h-3 w-64" />
            </div>
          </div>
          <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8 lg:p-6">
            <div className="hidden lg:block" aria-hidden="true">
              <div className="sticky top-0 space-y-6 pr-2">
                <div className="space-y-2">
                  <div className="skel h-4 w-32" />
                  <div className="skel h-3 w-20" />
                  <div className="skel mt-2.5 h-1.5 w-full rounded-full" />
                </div>
                <div className="flex flex-col gap-6">
                  {SECTIONS.map((s) => (
                    <div key={s.n} className="flex items-start gap-3 px-1">
                      <div className="skel size-5 shrink-0 rounded-full" />
                      <div className="flex-1 space-y-1.5 pt-0.5">
                        <div className="skel h-3.5 w-32" />
                        <div className="skel h-2.5 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="skel h-20 w-full rounded-xl" />
              </div>
            </div>
            <div className="min-w-0 space-y-6">
              <div className="dlg-card-plain p-1.5 lg:hidden">
                <div className="grid grid-cols-7 gap-0.5">
                  {SECTIONS.map((s) => (
                    <div key={s.n} className="skel h-9 w-full" />
                  ))}
                </div>
              </div>
              <SkeletonRows rows={4} rowClassName="h-20" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="space-y-6">
        {/* Canonical error branch — the shared shell ErrorCard (same anatomy
            as review-queue/recruitment/candidates/jobs-view). */}
        <ErrorCard
          title="Couldn't load your profile"
          description={error}
          onRetry={() => void loadAll(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* The view has no PageHeader by design (the sticky step band opens the
          page) — this visually-hidden h1 keeps the document outline valid for
          screen readers and the ⌘K / breadcrumbs context. */}
      <h1 className="sr-only">My Profile</h1>

      {/* MOBILE (< lg) — sticky COMPACT iOS-style segmented strip + caption.
          Same anatomy the user liked — 7 status cells with a sliding
          brand-blue thumb (motion layoutId) over a prev/next caption bar —
          tightened (36px cells, slimmer caption, 40px chevrons) and rounded
          like an iOS control: overflow-hidden clips every hover/fill to the
          card's 24px curve, and the sliding thumb carries a 10px radius.
          The strip is a DIRECT child of the tall view root, NOT a grid
          item — a sticky element can never travel past its containing
          block — and it pins under the mobile top bar for the whole
          scroll. Task 34-b: the workspace scroller below lg is now the
          shell's PullToRefresh container, whose top edge ALREADY sits
          under the top bar — so the pin offset is top-0 here (the old
          top-16 left a 64px gap for content to slide through above the
          pinned strip). */}
      <nav ref={mobileNavRef} aria-label="Profile sections" className="dlg-card-plain sticky top-0 z-30 overflow-hidden p-1.5 shadow-e2 lg:hidden">
        <div className="grid grid-cols-7 gap-0.5">
          {SECTIONS.map((s, i) => {
            const isActive = active === s.n;
            const filled = sectionDone[s.n - 1];
            return (
              <button
                key={s.n}
                type="button"
                onClick={() => requestSection(s.n)}
                aria-label={`Section ${i + 1}: ${s.label}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative isolate flex min-h-9 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 transition-colors",
                  isActive ? "text-primary-foreground" : "text-ink hover:bg-fog"
                )}
              >
                {/* Sliding thumb — rendered INSIDE the active cell so inset-0
                    matches the cell bounds; layoutId slides it between cells
                    on section change. 12px on the 36px cell — the Jeton
                    button step. */}
                {isActive && (
                  <motion.span
                    aria-hidden="true"
                    layoutId="profile-mobile-seg"
                    className="absolute inset-0 -z-10 rounded-[12px] bg-primary"
                    transition={{ type: "spring", stiffness: 500, damping: 42 }}
                  />
                )}
                <span
                  className={cn(
                    "num text-[11px] font-medium leading-none",
                    isActive ? "text-primary-foreground/85" : "text-stone"
                  )}
                >
                  {s.num}
                </span>
                {filled ? (
                  <CheckCircle2
                    className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary-foreground" : "text-[var(--ok)]")}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                ) : (
                  /* Not filled yet — soft ring, same size/weight as the green
                     check so both states read at a glance (light ring on the
                     blue active cell, where red would clash). */
                  <Circle
                    className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary-foreground/90" : "text-[var(--bad)]")}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
        {/* Caption + sequential stepping — hairline footer bar with quiet
            chevrons and an aria-live position readout. */}
        <div className="mt-1 flex items-stretch border-t border-border">
          <button
            type="button"
            onClick={requestStepBack}
            disabled={!backTarget}
            aria-label="Previous part or section"
            className="focus-ring grid w-10 shrink-0 place-items-center text-stone transition-colors hover:bg-fog disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
          <p
            aria-live="polite"
            className="eyebrow min-w-0 flex-1 truncate py-2 text-center"
          >
            {`Section ${activeIdx + 1} of ${SECTIONS.length} · ${SECTIONS[activeIdx]?.label ?? ""}`}
          </p>
          <button
            type="button"
            onClick={requestStepForward}
            disabled={!forwardTarget}
            aria-label="Next part or section"
            className="focus-ring grid w-10 shrink-0 place-items-center text-stone transition-colors hover:bg-fog disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </nav>

      {/* Task 62 (user: the foot-of-page button went unnoticed on phones) —
          once §7.4's requirements are satisfied the Mark Profile as Complete
          gate surfaces HERE, directly under the pinned section strip and
          above every form card, as an ok-tinted ready banner with a
          full-width primary button. Marking still routes through the same
          confirm dialog (setMarkOpen). lg+ is untouched — the wizard header
          already carries the CTA on the right. Once complete the banner
          retires (the desktop header's Profile Complete pill has no mobile
          duplicate by design). */}
      {!isComplete && canMarkComplete && (
        <div className="rounded-2xl border border-ok/25 bg-ok-bg px-4 py-4 lg:hidden" role="status">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-white"
            >
              <ShieldCheck className="size-4.5 text-ok" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug text-ink">All set — your profile is ready</p>
              <p className="mt-0.5 text-xs leading-snug text-stone">
                Mark it complete to unlock Home and Job Opportunities.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMarkOpen(true)}
            disabled={marking}
            data-tour="mark-complete-mobile"
            className="dlg-cta focus-ring mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Mark Profile as Complete
          </button>
        </div>
      )}

      {/* ── D. Merged wizard card (lg+): ONE container holds the page header
          (back circle + title + subtitle), the Profile Progress rail (caption,
          fraction bar, reui stepper tiles, Need-Assistance note) and the
          bordered form panel with its own pinned action bar — the exact
          anatomy of the reference wizard design. The active section's
          SectionCard surrenders its chrome inside the panel (see the
          .profile-wizard rules in globals.css) so the panel border is the
          only card edge. Below lg the wrapper is inert: the iOS strip above
          + the sections' own cards own the phone layout, and the page-level
          footer row below stays for phones. Clicks still route through
          requestSection, so the character-reference gate and the
          unsaved-changes dialog stay intact. ── */}
      <section aria-label="Profile sections" className="profile-wizard">
        {/* Header row — back circle + title + subtitle, and (Task 15) the
            Mark Profile as Complete CTA on the RIGHT of this section: the
            gate button is visible from the start — disabled with a why-tip
            until the §7.4 requirements are met, primary once they are, and
            a quiet "Profile Complete" pill once marked. The Home/Jobs
            navigation gate (page.tsx) releases on the SAME flag this sets. */}
        {/* Task 44 — the header row wears the system's cloudy tint (the same
            bg-cloud the mini-profile pill uses), top corners matched to the
            wizard card's 16px radius so the tint clips cleanly. */}
        <div className="hidden items-center gap-4 rounded-t-2xl border-b border-divider/60 bg-cloud px-8 py-6 lg:flex">
          <button
            type="button"
            onClick={requestPortalExit}
            aria-label="Back to portal"
            className="focus-ring grid size-10 shrink-0 place-items-center rounded-full border border-border bg-white text-stone transition-colors hover:bg-fog hover:text-ink"
          >
            <ArrowLeft className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-semibold leading-tight text-ink">My Profile</h2>
            <p className="mt-0.5 text-sm text-stone">
              Build or update your Personal Data Sheet — it powers every application you submit.
            </p>
          </div>
          {isComplete ? (
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-3.5 py-2 text-xs font-medium text-success"
              role="status"
            >
              <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Profile Complete
            </span>
          ) : (
            <span
              className="inline-flex shrink-0"
              title={
                canMarkComplete
                  ? undefined
                  : "Finish Personal Information, Education and Work Experience to enable"
              }
            >
              <button
                type="button"
                onClick={() => setMarkOpen(true)}
                disabled={!canMarkComplete || marking}
                aria-disabled={!canMarkComplete || marking}
                data-tour="mark-complete-desktop"
                className="dlg-cta focus-ring inline-flex min-h-[44px] items-center gap-2 px-5 py-2.5 text-sm disabled:pointer-events-none disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Mark Profile as Complete
              </button>
            </span>
          )}
        </div>

        <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8 lg:p-6">
          {/* LEFT — Profile Progress rail (lg+): caption + fraction bar +
              the c-stepper-44 stepper + help note. Sticky top-0: the inner
              box travels the column while the page scrolls (the wizard page
              still scrolls below the bounded panel — e.g. to the PDS card —
              and on short viewports the rail scrolls internally). Sections
              complete out of order, so
              each ring's state comes from the SAVED section data
              (computeProfileCompletion) — the section you're ON spins the
              running ring, saved-and-done sections read the green check,
              the rest stay dashed pending circles, and a continuous
              connector rail (green behind completed sections) runs through
              them like an actual stepper. */}
          <nav aria-label="Profile section steps" className="hidden lg:block">
            {/* FIXED 90dvh rail box (same bound as the form panel — raised
                from 76dvh per user request: the old cap read short): the
                grid row — and therefore every section's panel — keeps ONE
                constant height, whether Personal Information's sub-task list
                is shown or not (its extra ~130px now scrolls internally here
                instead of stretching the wizard row). */}
            <div className="sticky top-0 flex h-[90dvh] flex-col gap-6 overflow-y-auto pr-2 scroll-thin">
              <div>
                {/* Task 27 (user direction) — the desktop rail reads one step
                    larger: heading, caption, fraction bar, rings, titles and
                    meta all grew from the previous compact sizing. */}
                <p className="text-lg font-semibold text-ink">Profile Progress</p>
                <p className="mt-0.5 text-sm text-stone">
                  {`Step ${activeIdx + 1} of ${SECTIONS.length}`}
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-cloud">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${Math.round(((activeIdx + 1) / SECTIONS.length) * 100)}%` }}
                  />
                </div>
              </div>

              <Stepper
                value={active}
                onValueChange={requestSection}
                orientation="vertical"
                indicators={PHASE_RINGS}
                className="w-full"
              >
                <StepperNav>
                  {SECTIONS.map((s, i) => {
                    const done = sectionDone[s.n - 1];
                    // Active wins the state (drives "you are here" highlight +
                    // aria-current), but COMPLETENESS now wins the RING: a
                    // finished section keeps its green check even while it is
                    // the one being viewed — the spinner only ever means
                    // "active AND not saved yet" (user bug report).
                    const state = active === s.n ? "active" : done ? "completed" : "inactive";
                    const isLast = i === SECTIONS.length - 1;
                    const approx = s.minutes != null ? `Approx ${s.minutes} min` : null;
                    return (
                      <StepperItem
                        key={s.n}
                        step={s.n}
                        state={state}
                        loading={state === "active" && !done}
                        className={cn("relative flex-col items-stretch", isLast ? "pb-0" : "pb-9")}
                      >
                        {/* The connector rail — one piece per item running
                            from just below this ring to just above the next
                            one (the pattern's 2px gaps cut at every ring),
                            turning green once the section is complete. */}
                        {!isLast && (
                          <span
                            aria-hidden="true"
                            className={cn(
                              "pointer-events-none absolute bottom-px top-8 start-[13.4px] w-[1.4px] rounded-full bg-border transition-colors",
                              done && "bg-success"
                            )}
                          />
                        )}

                        <StepperTrigger className="w-full flex-row items-start gap-3 rounded-xl text-left transition-colors hover:bg-fog/70">
                          {/* Completed sections keep the check ring while
                              active — the children override beats the
                              loading-indicator fallback in the stepper kit. */}
                          <StepperIndicator className="size-7 shrink-0 bg-transparent p-0">
                            {state === "active" && done ? PHASE_RINGS.completed : undefined}
                          </StepperIndicator>
                          <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                            <StepperTitle
                              className={cn(
                                "text-start text-base font-semibold leading-6",
                                state === "active" && "text-primary",
                                state === "completed" && "text-ink",
                                state === "inactive" && "text-stone"
                              )}
                            >
                              {s.label}
                            </StepperTitle>
                            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-5 text-stone">
                              <span className="num">Step {i + 1}</span>
                              {approx && <span>{approx}</span>}
                              {done && (
                                <span className="font-medium text-success">Completed</span>
                              )}
                            </span>
                          </span>
                        </StepperTrigger>

                        {/* Personal Information's sub-parts — the pattern's
                            nested task list under the active phase. NO
                            collapsible (user retired the expand/collapse):
                            plain markup shown while the phase is active —
                            click SWITCHES the form (only the selected
                            sub-part renders in the panel) and each ring
                            reads the SAVED record. */}
                        {s.n === 1 && active === 1 && (
                          <div className="ms-[38px] mt-1.5 flex flex-col pb-1.5">
                            {PI_SUBS.map((t, j) => {
                              const done = piSubDone[j];
                              const selected = piSub === t.id;
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => selectPiSub(t.id)}
                                  aria-label={`${t.label}${done ? ", completed" : selected ? ", in progress" : ""}`}
                                  aria-current={selected ? "true" : undefined}
                                  className="relative flex min-h-[30px] items-center gap-2.5 rounded-lg pr-2 text-left transition-colors hover:bg-fog/70"
                                >
                                  {/* task rail — short pieces between
                                      the small rings, green behind a
                                      completed task */}
                                  {j > 0 && (
                                    <span
                                      aria-hidden="true"
                                      className={cn(
                                        "pointer-events-none absolute start-[8.5px] top-0 h-1.5 w-px",
                                        piSubDone[j - 1] ? "bg-success" : "bg-border"
                                      )}
                                    />
                                  )}
                                  {j < PI_SUBS.length - 1 && (
                                    <span
                                      aria-hidden="true"
                                      className={cn(
                                        "pointer-events-none absolute bottom-0 top-6 start-[8.5px] w-px",
                                        done ? "bg-success" : "bg-border"
                                      )}
                                    />
                                  )}
                                  <span className="grid size-4.5 shrink-0 place-items-center">
                                    {/* Selected AND saved → the saved check
                                        wins; the task spinner only reads
                                        "active AND not completed yet". */}
                                    {selected && !done ? (
                                      <PhaseRunning
                                        className="size-3.25"
                                        trackMask={TASK_TRACK_MASK}
                                        arcMask={TASK_ARC_MASK}
                                      />
                                    ) : done ? (
                                      <PhaseCompleted className="size-3.5" />
                                    ) : (
                                      <PhasePending className="size-3.5" />
                                    )}
                                  </span>
                                  <span
                                    className={cn(
                                      "truncate text-sm leading-none",
                                      selected
                                        ? "font-medium text-primary"
                                        : done
                                          ? "text-stone"
                                          : "font-medium text-ink"
                                    )}
                                  >
                                    {t.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </StepperItem>
                    );
                  })}
                </StepperNav>
              </Stepper>
            </div>
          </nav>

          {/* RIGHT — bordered form panel: the active section renders
              chrome-less inside (.profile-wizard flatten rules) and the panel
              owns the pinned action bar. Cloud surface (QA 2026-10-21, user
              analysis request): the panel carries the pale Cloud tint so the
              WHITE content cards inside (entry tiles, spec-sheet grids,
              document rows, white/80 forms) read as elevated cards on a
              cloud surface — the same geometry as the Home tiles and the
              documents upload panel, instead of white-on-white. UNIFORM
              HEIGHT (user request): every
              section — Personal Information included — sits in the same
              bounded panel (max 90dvh — raised from 76dvh per user request:
              the old cap read short — internal scrollbar under the bar), so
              the container keeps one consistent height across all seven
              steps. (The old natural-height special case for section 01 died
              with the sub-part model: one sub-part at a time is
              section-sized content.) overflow-anchor none: Chrome must not
              re-anchor onto the action bar when a short section is swapped
              for a tall one. */}
          <div className="flex min-w-0 flex-col lg:max-h-[90dvh] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-cloud/40">
            <div
              ref={sectionsRef}
              className="profile-wizard-body scroll-thin min-h-[360px] min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
              style={{ overflowAnchor: "none" }}
            >
              {/* SECTION CONTENT — sections swap with a quiet fade/rise (200ms):
                  perceptible placement without choreography. */}
              <div className="min-w-0">
                <div key={active} className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                  {active === 1 && (
                    <PersonalInfoSection
                      profile={profile}
                      seed={seed}
                      sub={piSub}
                      onSubChange={selectPiSub}
                      refreshSession={refresh}
                      onChanged={reloadSilent}
                      onUnsavedChange={handleUnsavedChange}
                    />
                  )}
                  {active === 2 && (
                    <EducationSection
                      items={profile?.educations ?? []}
                      courses={(reference?.courses ?? []).map((c) => c.name)}
                      onChanged={reloadSilent}
                    />
                  )}
                  {active === 3 && <WorkExperienceSection items={profile?.workExperiences ?? []} onChanged={reloadSilent} />}
                  {active === 4 && <TrainingSection items={profile?.trainings ?? []} onChanged={reloadSilent} />}
                  {active === 5 && (
                    <EligibilitySection
                      items={profile?.eligibilities ?? []}
                      referenceNames={(reference?.eligibilities ?? []).map((e) => e.name)}
                      onChanged={reloadSilent}
                    />
                  )}
                  {active === 6 && <AwardsSection items={profile?.awards ?? []} onChanged={reloadSilent} />}
                  {active === 7 && <DocumentsSection docs={docs} onChanged={reloadSilent} />}
                </div>
              </div>
            </div>

            {/* Panel action bar (lg+) — the reference design's footer anatomy:
                quiet outline Back on the left, primary Continue right, pinned
                under the scroll area on the tinted bar. On section 01 the
                pair steps through the sub-parts (Identity → Address → Legal
                Disclosures → Character References) before Education. */}
            <div className="hidden items-center justify-between gap-3 border-t border-border bg-cloud/50 px-6 py-3.5 lg:flex">
              {backTarget ? (
                <button
                  type="button"
                  onClick={requestStepBack}
                  className="focus-ring inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-white px-5 text-sm font-medium text-ink transition-colors hover:bg-fog"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Back to {backTarget}
                </button>
              ) : (
                <span aria-hidden="true" />
              )}

              {forwardTarget ? (
                <button
                  type="button"
                  onClick={requestStepForward}
                  className="dlg-cta focus-ring inline-flex min-h-[44px] items-center gap-1.5 px-6 text-sm font-medium"
                >
                  Continue to {forwardTarget}
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={requestPortalExit}
                  className="dlg-cta focus-ring inline-flex min-h-[44px] items-center gap-1.5 px-6 text-sm font-medium"
                >
                  Return to Portal
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* QA 2026-02 — Section progression footer (MOBILE ONLY — on lg+ the
          merged wizard card carries its own pinned action bar inside the
          form panel): an explicit Back / Continue affordance so it's
          immediately obvious how to move between the seven PDS sections —
          and, on section 01, through its four sub-parts first.
          changeSection brings the mobile strip back into view on switch.
          Task 18 (user report): the old flex-wrap/justify-between row let
          the long labels ("Back to Personal Information", "Continue to
          Character References") stretch the buttons huge and wrap into a
          zig-zag on phones. The pair now shares ONE row as equal grid
          halves — compact 13px labels that truncate instead of stretching
          (min-w-0 lets the flex span actually ellipsize), icons inline, and
          the grid owns the sizing so there is no wrapper padding bloat.
          Solo Continue (section 01's first sub-part) takes the full row.
          Height stays at the 44px touch-target floor. */}
      <div
        className={cn(
          "grid items-stretch gap-2.5 border-t border-border pt-3.5 lg:hidden",
          backTarget ? "grid-cols-2" : "grid-cols-1"
        )}
      >
        {backTarget ? (
          <button
            type="button"
            onClick={requestStepBack}
            className="dlg-ghost focus-ring inline-flex min-h-[44px] items-center justify-center gap-1 px-2 text-[13px]"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">Back to {backTarget}</span>
          </button>
        ) : null}

        {forwardTarget ? (
          <button
            type="button"
            onClick={requestStepForward}
            className="dlg-cta focus-ring inline-flex min-h-[44px] items-center justify-center gap-1 px-2 text-[13px] font-medium"
          >
            <span className="min-w-0 truncate">Continue to {forwardTarget}</span>
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={requestPortalExit}
            className="dlg-cta focus-ring inline-flex min-h-[44px] items-center justify-center gap-1 px-2 text-[13px] font-medium"
          >
            <span className="min-w-0 truncate">Return to Portal</span>
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* ── Completion note — MOBILE ONLY, and (Task 62) now GUIDANCE ONLY:
          while §7.4's requirements are still unmet the note explains what is
          missing at the foot of the page. The Mark Complete button itself
          moved to the TOP of the page (the ready banner under the section
          strip) where it is actually seen; the desktop wizard header keeps
          its own CTA at lg+. ── */}
      {!isComplete && !canMarkComplete && (
        <div className="lg:hidden">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-stone">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Completion requires your Personal Information (first name, last name, email, mobile number, and at least one character reference) and at least one entry
              each in Education and Work Experiences.
            </span>
          </p>
        </div>
      )}

      {/* ── OPTIONAL · Auto-fill from PDS — deliberately LAST and collapsed:
              manual form filling is the primary path (credentials-first per
              user); the PDS import is a shortcut for applicants who already
              have a filled CS Form 212. ── */}
      <section aria-label="Optional PDS auto-fill">
        <PdsUploadCard docs={docs} onProfileReplaced={onProfileReplaced} onDocsChanged={reloadSilent} />
      </section>

      {/* Task 40 — unsaved-changes navigation guard: fires when the
          applicant tries to leave section 01 (another section, or the
          portal) while its edit session holds unsaved edits. "Discard &
          leave" continues the ORIGINAL navigation request (pendingNav). */}
      <AlertDialog
        open={navOpen}
        onOpenChange={(o) => {
          setNavOpen(o);
          if (!o) setPendingNav(null);
        }}
      >
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-ink">Leave with unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-stone">
              Your edits in Personal Information haven&apos;t been saved yet. Leaving this section now will discard
              them — your profile keeps its last saved values.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtn}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmLeave();
              }}
              className={ghostBadBtn}
            >
              Discard &amp; leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark Complete confirm (§7.4) */}
      <AlertDialog open={markOpen} onOpenChange={setMarkOpen}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-ink">Mark your profile as complete?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-stone">
              Your profile will be ready for application and subject to verification by HR. All statements become part
              of your civil-service application record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtn}>Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void markComplete();
              }}
              disabled={marking}
              className="dlg-cta min-h-[44px] px-5 py-2.5 text-sm disabled:opacity-50"
            >
              {marking ? "Marking…" : "Mark Complete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Task 15 — profile guided tour: one focused step spotlighting the
          optional "Auto-fill from PDS" card at the foot of the page (the
          upload-PDS entry point). The card renders on desktop AND mobile
          (always last in the flow), so the single [data-tour] hook covers
          both viewports; OnboardingTour auto-scrolls the target into view
          and remembers the dismissal per browser. */}
      <OnboardingTour
        storageKey="rmis.tour.profile.v1"
        title="Quick tip before you start"
        description="You can build your Personal Data Sheet by hand — or let RMIS do the heavy lifting from an uploaded PDS. You can skip this tip anytime."
        steps={[
          {
            selector: '[data-tour="pds-upload"]',
            title: "Auto-fill from PDS",
            body: "Already have a filled CS Form 212 (.xlsx)? Expand this card and upload it — RMIS reads your PDS and pre-fills every section for you. Prefer typing? Just fill the forms manually; this step is optional (beta).",
          },
        ]}
      />

      {/* Task 88 (user request) — the completion nudge: when EVERY section
          shows its green check but the profile is not yet marked complete,
          spotlight the Mark Profile as Complete button so the last step
          can't be missed. Nudge mode (autoStart — no welcome dialog); the
          dismissal is PER-SESSION, so an applicant who skips it is reminded
          once more on their next visit — until they actually mark it, which
          unmounts the tour via isComplete. The step targets the surface the
          current viewport renders (mobile ready-banner button under the
          section strip / desktop wizard-header CTA top right). */}
      {nudgeReady && otherTourSettled && allSectionsDone && !isComplete && (
        <OnboardingTour
          autoStart
          persist="session"
          storageKey="rmis.tour.profile-complete.v1"
          title="Your profile is complete"
          description="One last step — mark it complete to start applying."
          steps={[
            isBelowLg
              ? {
                  selector: '[data-tour="mark-complete-mobile"]',
                  title: "Last step — mark it complete",
                  body: 'All 7 sections are done. Tap "Mark Profile as Complete" below so HR knows your profile is finished — that is what unlocks applying to open positions. Everything you filled in is already saved.',
                }
              : {
                  selector: '[data-tour="mark-complete-desktop"]',
                  title: "Last step — mark it complete",
                  body: 'All 7 sections are done. Click "Mark Profile as Complete" (top right) so HR knows your profile is finished — that is what unlocks applying to open positions. Everything you filled in is already saved.',
                },
          ]}
        />
      )}
    </div>
  );
}
