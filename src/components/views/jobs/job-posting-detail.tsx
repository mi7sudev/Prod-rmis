"use client";

// ============================================================================
// RMIS — Job posting DETAIL mode (#/job-opportunities?job=<id>).
// Task 13 — the user pinned the EXACT reference look (Workze-style posting):
// a plain typographic MAIN column — oversized bold title, employer line,
// an icon meta row (place · position type), a hairline rule, then the
// "Description | Requirements" tab navs (Task 30, user direction — renamed
// from the earlier "Job Description | Job Detail" pair, contents regrouped:
// Description = Overview + Compensation + Timeline; Requirements =
// Qualifications + MQR + Key Competency)
// — and a right ASIDE of two white hairline cards: the summary card (place
// row, application note, salary headline + caption, divider, plain icon
// rows — Item No. / Position Type / Vacancies / Salary Grade / Application
// Deadline / Posted, the reference's row anatomy) with the session-aware
// dark-ink CTA — Apply for this job / Re-apply / Sign in to Apply (locked
// once the deadline passes) or the disabled Application Submitted + Cancel
// Application behind its AlertDialog (spec §7.7) — the small agency card is
// RETIRED (Task 29: it restated the header attribution; the mobile sheet's
// Company tab went with it in Task 30). A compact lg:hidden
// CTA under the header keeps the apply action above the phone fold (the
// reference's aside lands below the content there). NOT a modal — a full
// page.
// MOBILE DRAWER (below lg, user-pinned reference) — the complete detail is a
// BOTTOM DRAWER instead of the stacked page: a rounded-top sheet springs up
// over a dimmed scrim (portal → document.body, z-[60] so it floats above the
// mobile tab bar) carrying the reference anatomy — circular back / centered
// "Job Detail" / share header row, the agency tile + title +
// "DOST-MIRDC · place" + bookmark row, fact chips (vacancies / salary /
// salary grade / deadline, then a "+N" overflow chip like the reference —
// Task 29 dropped the type/division chips, they restated the attribution
// line right above), the Description | Requirements segmented pill tabs
// (active = dark pill, Task 30), the Description panel (About this role
// with a line-clamped "Read more", Compensation, Timeline tiles, Position
// summary rows) and Requirements (Qualifications disc bullets + MQR divider
// rows + the folded Key Competency), and a
// FLOATING brand-blue "Apply this job" CTA that wears the mobile nav bar's
// exact geometry — 54px tall, 26px pill radius, 16px side insets, 12px +
// safe-area off the bottom, the nav's own drop shadow — but in the .dlg-cta
// apply-blue variant (Apply this job / Re-apply / Sign in to Apply). Once
// the applicant has applied, the SAME pill swaps to an enabled
// "Cancel Application" (opens the confirm dialog) with a compact white
// "You applied to this position" capsule above it as the applied signal.
// It floats OVER the scrolling content exactly like the nav floats over the
// page; the scroll region carries matching bottom padding. Back button,
// scrim tap and Escape
// slide the sheet down BEFORE the route hands back to the board. Both the
// drawer and the desktop page render from the same state, CSS-gated
// (lg:hidden / hidden lg:block) so there is no hydration flash on phones.
// Router contract unchanged: #/job-opportunities (no job param) = the
// Job Opportunities explorer; #/job-opportunities?job=<id> = THIS page — the
// home quick-view's "Read full description" destination. Data: GET
// /api/jobs?limit=200 (mount + 30s silent poll + focus refetch) so the
// Applied state stays truthful; closed postings still render (locked CTA),
// unknown ids get the "Position not found" state. Works for anonymous
// visitors — the apply gate (useApplyFlow) routes them to sign-in. No
// email-sender files touched.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Banknote,
  Bookmark,
  Briefcase,
  CalendarClock,
  Check,
  ChevronLeft,
  Clock,
  Coins,
  FileText,
  MapPin,
  Search,
  Share,
  Users,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { useApplyFlow } from "@/components/apply/apply-dialogs";
import { useSession } from "@/components/session-provider";
import { ghostBadBtn } from "@/components/ui/buttons";
import { CollapsibleSection } from "@/components/jobs/collapsible-section";
import { DetailTabs, INK_CTA, RichOrPlain, sgLabel } from "@/components/views/jobs/posting-detail-tabs";
import { useSavedJobs } from "@/lib/use-saved-jobs";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiFetch, deadlineState, formatCurrency, formatDate, humanize } from "@/lib/client";
import { isActiveApplicationStatus } from "@/lib/status";
import { divisionFullName } from "@/lib/constants";
import { navigate, useHashRoute, type JobWire } from "@/lib/router";
import { EmptyState, ErrorCard } from "@/components/ui/shell";
import { Alert, AlertAction, AlertContent, AlertDescription, AlertIcon, AlertTitle } from "@/components/motion/alert";
import { Skeleton } from "@/components/ui/skeleton";

// ── Helpers ─────────────────────────────────────────────────────────────────

// ── Mobile drawer content primitives (15px reading size per the reference) ──

/** Rich-or-plain body text at the drawer's 15px reading step. */
function SheetRich({ html, text }: { html?: string | null; text?: string | null }) {
  if (html && html.trim()) {
    return (
      <div
        className="rich-text text-[15px] leading-relaxed text-stone"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  if (text && text.trim()) {
    return <p className="whitespace-pre-line text-[15px] leading-relaxed text-stone">{text}</p>;
  }
  return null;
}

/** Drawer bullet section — sanitized rich HTML when present, else disc
    bullets (the reference's Qualifications list anatomy). Renders nothing
    when the posting carries no content for the section. */
function SheetBullets({
  title,
  html,
  text,
  className,
}: {
  title: string;
  html?: string | null;
  text?: string | null;
  className?: string;
}) {
  const hasHtml = !!html && !!html.trim();
  const items = (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  if (!hasHtml && items.length === 0) return null;
  return (
    <section className={className}>
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <div className="mt-2.5">
        {hasHtml && html ? (
          <div className="rich-text text-[15px] leading-relaxed text-stone" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <ul className="list-disc space-y-2.5 pl-5 text-[15px] leading-relaxed text-stone">
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ── Main · typographic header (reference: title / employer / meta row) ──────

function PostingHeader({
  job,
  signedIn,
  onApply,
}: {
  job: JobWire;
  signedIn: boolean;
  onApply: (job: JobWire) => void;
}) {
  const pos = job.position;
  const dl = deadlineState(job.deadlineDate);
  const applied = (job.applications ?? []).some((a) => isActiveApplicationStatus(a.status));
  const priorAttempt = !applied && (job.applications?.length ?? 0) > 0;
  const ctaLabel = applied
    ? "Application Submitted"
    : dl.overdue
      ? "Applications Closed"
      : priorAttempt
        ? "Re-apply"
        : signedIn
          ? "Apply for this job"
          : "Sign in to Apply";

  return (
    <header aria-label="Position header">
      <h1 className="text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
        {humanize(job.title)}
      </h1>
      <p className="mt-2 text-[15px] leading-snug text-stone">
        {[
          "DOST-MIRDC",
          pos?.division ? divisionFullName(pos.division) : null,
          pos?.section || null,
        ].filter(Boolean).join(" · ")}
      </p>

      {/* Meta row — REMOVED (user: "📍 division · 💼 Permanent" under the
          title duplicated the attribution line right above it, which already
          speaks "DOST-MIRDC · {division} · {section}"). */}

      {/* Phones only — the aside (with the full CTA + cancel flow) stacks
          below the posting on small screens, so the apply action still sits
          above the fold; the reference layout itself starts at lg. */}
      <div className="mt-5 lg:hidden">
        <button
          type="button"
          onClick={() => onApply(job)}
          disabled={dl.overdue || applied}
          className={`${INK_CTA} w-full`}
        >
          {applied && <Check className="h-4 w-4" aria-hidden="true" />}
          {ctaLabel}
        </button>
      </div>
    </header>
  );
}

// ── Aside · summary card (reference: place / note / salary / rows / CTA) ────

function SummaryCard({
  job,
  signedIn,
  onApply,
  onCancel,
  cancelling,
}: {
  job: JobWire;
  signedIn: boolean;
  onApply: (job: JobWire) => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const pos = job.position;
  const dl = deadlineState(job.deadlineDate);
  // MOM 2026-10-13 — re-application: an active application shows the applied
  // state + Cancel; a rejected/withdrawn history shows the re-apply path.
  const applied = (job.applications ?? []).some((a) => isActiveApplicationStatus(a.status));
  const priorAttempt = !applied && (job.applications?.length ?? 0) > 0;

  const rows: { icon: ComponentType<{ className?: string }>; value: string; caption: string; overdue?: boolean }[] = [
    { icon: FileText, value: pos?.itemNumber || "-", caption: "Item No." },
    { icon: Briefcase, value: job.positionType ? humanize(job.positionType) : "-", caption: "Position Type" },
    {
      icon: Users,
      value: job.numberOfVacancy == null ? "-" : String(job.numberOfVacancy),
      caption: "Vacancies",
    },
    { icon: Coins, value: sgLabel(pos?.salaryGrade, pos?.salaryStep), caption: "Salary Grade" },
    {
      icon: CalendarClock,
      value: job.deadlineDate ? formatDate(job.deadlineDate) : "Open until filled",
      caption: dl.overdue ? "Deadline passed" : "Application Deadline",
      overdue: dl.overdue,
    },
    { icon: Clock, value: formatDate(job.publishDate ?? job.publishedAt), caption: "Posted" },
  ];

  return (
    <div className="dlg-card-plain border border-border p-6" aria-label="Position summary">
      <div className="flex items-center gap-2.5">
        <MapPin className="h-4 w-4 shrink-0 text-body-gray" aria-hidden="true" />
        <p className="truncate text-sm font-medium text-ink">
          {pos?.division ? divisionFullName(pos.division) : "-"}
        </p>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-stone">
        Please submit your application for this job post on or before the deadline.
      </p>

      <div className="mt-5 border-t border-border pt-5">
        <p className="num text-3xl font-bold leading-none text-ink">
          {pos?.salaryAmount != null
            ? formatCurrency(pos.salaryAmount)
            : pos?.salaryGrade
              ? `SG${pos.salaryGrade}`
              : "-"}
        </p>
        <p className="mt-1.5 text-xs text-body-gray">Monthly Salary</p>
      </div>

      <ul className="mt-5 space-y-3.5 border-t border-border pt-5">
        {rows.map(({ icon: Icon, value, caption, overdue }) => (
          <li key={caption} className="flex items-center gap-3">
            <Icon
              className={`h-4 w-4 shrink-0 ${overdue ? "text-[var(--bad)]" : "text-body-gray"}`}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span
                className={`num block truncate text-sm font-medium ${
                  overdue ? "text-[var(--bad)]" : "text-ink"
                }`}
                title={value}
              >
                {value}
              </span>
              <span className="block text-xs text-body-gray">{caption}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5">
        <Alert variant="success" open={applied} className={applied ? "mb-3" : undefined}>
          <AlertIcon>
            <Check />
          </AlertIcon>
          <AlertContent>
            <AlertTitle>Successfully Applied</AlertTitle>
            <AlertDescription>Your application is in the pipeline.</AlertDescription>
          </AlertContent>
        </Alert>
        {/* MOM 2026-10-13 — the applicant may re-apply after a rejection. */}
        <Alert variant="warning" open={priorAttempt} className={priorAttempt ? "mb-3" : undefined}>
          <AlertIcon>
            <Clock />
          </AlertIcon>
          <AlertContent>
            <AlertTitle>Previous application not shortlisted</AlertTitle>
            <AlertDescription>You may re-apply to this posting while it remains open.</AlertDescription>
          </AlertContent>
        </Alert>

        {applied ? (
          <>
            <button type="button" disabled className={`${INK_CTA} w-full`}>
              <Check className="h-4 w-4" aria-hidden="true" />
              Application Submitted
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="focus-ring mt-2 min-h-[44px] w-full rounded-xs text-sm font-medium text-body-gray underline-offset-2 hover:text-ink hover:underline disabled:pointer-events-none disabled:opacity-50"
                  disabled={cancelling}
                >
                  Cancel Application
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="dlg-card-plain">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-display text-2xl text-ink">
                    Cancel this application?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm text-body-gray">
                    Your application for {humanize(job.title)} will be withdrawn. You can apply
                    again while the position is open.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="dlg-ghost min-h-[44px] px-6 text-sm">
                    Keep application
                  </AlertDialogCancel>
                  <AlertDialogAction onClick={onCancel} className={`${ghostBadBtn} px-6`}>
                    Cancel application
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onApply(job)}
              disabled={dl.overdue}
              className={`${INK_CTA} w-full`}
            >
              {dl.overdue ? "Applications Closed" : priorAttempt ? "Re-apply" : signedIn ? "Apply for this job" : "Sign in to Apply"}
            </button>
            {dl.overdue && (
              <p className="mt-2 text-center text-xs text-stone">
                The deadline for this position has passed.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Aside · agency mini-card — RETIRED (user: the card restated the header's
//    division attribution; the SummaryCard alone now fills the aside). The
//    mobile sheet's Company tab is a separate surface and keeps its facts.

// ── Mobile · the complete-detail bottom drawer (reference-pinned) ───────────

/** The drawer chrome constants are FIXED ink literals (same reasoning as
    INK_CTA above): the segmented pill, the home indicator and the scrim must
    keep the reference's exact values in both themes. */
const SHEET_PILL_INK = "#0e1c26";
const SHEET_TOP_GAP = 84; // px of dimmed backdrop left visible above the sheet

/** Circular 40px header control — hairline border + whisper shadow, the
    reference's back/share circle anatomy. */
function SheetCircleBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full border border-divider bg-card text-ink shadow-[0_1px_3px_rgba(15,23,42,0.08)] transition-colors hover:bg-cloud disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function MobileDetailSheet({
  job,
  loading,
  error,
  signedIn,
  saved,
  applied,
  priorAttempt,
  overdue,
  cancelling,
  onSave,
  onApply,
  onCancelApplication,
  onRetry,
  onBack,
}: {
  job: JobWire | null;
  loading: boolean;
  error: string | null;
  signedIn: boolean;
  saved: boolean;
  applied: boolean;
  priorAttempt: boolean;
  overdue: boolean;
  cancelling: boolean;
  onSave: () => void;
  onApply: () => void;
  onCancelApplication: () => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  const reduced = useReducedMotion();
  const [closing, setClosing] = useState(false);
  const [tab, setTab] = useState<"description" | "requirements">("description");
  const [briefOpen, setBriefOpen] = useState(false);
  const closingRef = useRef(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close = slide the sheet down FIRST; the route hands back to the board
  // only when the exit animation has finished (onExitComplete). Escape and
  // scrim taps share the path. The matchMedia guard keeps the hidden desktop
  // copy of this component inert (it is display:none there — Escape must not
  // navigate while the user is reading the desktop page).
  const close = useCallback(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    closingRef.current = true;
    setClosing(true);
  }, []);

  const handleExited = useCallback(() => {
    if (closingRef.current) onBack();
  }, [onBack]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // The drawer covers the whole viewport (tab bar included), so the body
  // behind must not scroll while it is open (PublicShell scrolls the body).
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Keyboard/AT entry point lands on the sheet itself.
  useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  const share = useCallback(async () => {
    if (!job) return;
    const shareTitle = `${humanize(job.title)} — DOST-MIRDC`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: shareTitle, url: window.location.href });
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied", { description: "The posting link is on your clipboard." });
    } catch (err) {
      // A cancelled share sheet is not an error; a failed copy is.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        toast.error("Could not share this posting");
      }
    }
  }, [job]);

  const pos = job?.position ?? null;
  const title = job ? humanize(job.title) : "";

  // Fact chips — the reference's tag row, overflow folded into a "+N" chip.
  // Task 29 (user QA): the position-type and division chips are GONE — they
  // restated the attribution line right above ("DOST-MIRDC · {division}");
  // the position type lives in the Position summary rows, the division in
  // the attribution.
  const chipFacts: string[] = [];
  if (job?.numberOfVacancy != null)
    chipFacts.push(`${job.numberOfVacancy} ${job.numberOfVacancy === 1 ? "Vacancy" : "Vacancies"}`);
  if (pos?.salaryGrade)
    chipFacts.push(`SG ${pos.salaryGrade}${pos.salaryStep ? `/${pos.salaryStep}` : ""}`);
  if (pos?.salaryAmount != null) chipFacts.push(`${formatCurrency(pos.salaryAmount)} / month`);
  if (job?.deadlineDate) chipFacts.push(`Closes ${formatDate(job.deadlineDate)}`);
  const visibleChips = chipFacts.slice(0, 4);
  const extraChips = chipFacts.length - visibleChips.length;

  // Description tab (Task 30) — the summary-card rows, restacked for the
  // drawer (Item No. / Position Type / Vacancies / Salary Grade / Monthly
  // Salary / Deadline / Posted).
  const summaryRows: {
    icon: ComponentType<{ className?: string }>;
    value: string;
    caption: string;
    rowOverdue?: boolean;
  }[] = job
    ? [
        { icon: FileText, value: pos?.itemNumber || "-", caption: "Item No." },
        { icon: Briefcase, value: job.positionType ? humanize(job.positionType) : "-", caption: "Position Type" },
        {
          icon: Users,
          value: job.numberOfVacancy == null ? "-" : String(job.numberOfVacancy),
          caption: "Vacancies",
        },
        { icon: Coins, value: sgLabel(pos?.salaryGrade, pos?.salaryStep), caption: "Salary Grade" },
        ...(pos?.salaryAmount != null
          ? [{ icon: Banknote, value: formatCurrency(pos.salaryAmount), caption: "Monthly Salary" }]
          : []),
        {
          icon: CalendarClock,
          value: job.deadlineDate ? formatDate(job.deadlineDate) : "Open until filled",
          caption: overdue ? "Deadline passed" : "Application Deadline",
          rowOverdue: overdue,
        },
        { icon: Clock, value: formatDate(job.publishDate ?? job.publishedAt), caption: "Posted" },
      ]
    : [];

  const mqrRows: [string, string | null | undefined][] = job
    ? [
        ["Education", pos?.cscEducation],
        ["Work Experience", pos?.cscWorkExperience],
        ["Training", pos?.cscTraining],
        ["Eligibility", pos?.cscEligibilityGroup],
        ["License / Certification", pos?.license],
      ]
    : [];
  const visibleMqr = mqrRows.filter(([, v]) => v && !/^(n\/?a|none|na)\.?$/i.test(v.trim()));

  const briefText = job?.briefDescription ?? "";
  const longBrief = briefText.trim().length > 240;

  // Dock CTA — the same session-aware states the desktop aside speaks, with
  // the reference's "Apply this job" wording on the base path. Applied jobs
  // never reach this — their pill becomes "Cancel Application" instead.
  const ctaLabel = overdue
    ? "Applications Closed"
    : priorAttempt
      ? "Re-apply"
      : signedIn
        ? "Apply this job"
        : "Sign in to Apply";

  // Floating apply pill — the mobile tab bar's EXACT floating geometry,
  // transplanted onto the blue apply button: 54px tall (the bar's collapsed
  // 52 + 2 border), 26px radius (the bar's rounded-[26px] at 54px height),
  // and the bar's literal shadow token. The radius rides as an inline style
  // because .dlg-cta pins 12px UNLAYERED — layered rounded-* utilities would
  // lose that fight (same mechanism as the SHEET_PILL_INK inline styles).
  const floatingApplyPill =
    "dlg-cta pointer-events-auto inline-flex h-[54px] w-full items-center justify-center gap-2 text-[15px] shadow-[0_12px_40px_rgba(31,32,37,0.18)] transition-all disabled:cursor-not-allowed disabled:opacity-50";
  const floatingPillRadius = { borderRadius: 26 } as const;
  // Floating status capsule — the white pill the nav bar itself wears
  // (bg-card + border-border + the same shadow), compacted to 36px. Sits
  // above the CTA pill to carry the deadline note / the applied signal.
  const floatingNoteCapsule =
    "pointer-events-auto flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-border bg-card/95 text-xs text-stone shadow-[0_12px_40px_rgba(31,32,37,0.18)]";

  const tabs = [
    { id: "description", label: "Description" },
    { id: "requirements", label: "Requirements" },
  ] as const;

  const scrimVariants = { hidden: { opacity: 0 }, show: { opacity: 1 } };
  const sheetVariants = reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : { hidden: { y: "100%" }, show: { y: 0 } };

  return (
    <AnimatePresence onExitComplete={handleExited}>
      {!closing && (
        <motion.div
          key="mobile-job-detail-sheet"
          initial="hidden"
          animate="show"
          exit="hidden"
          className="fixed inset-0 z-[60]"
        >
          {/* Scrim — tap to dismiss */}
          <motion.button
            type="button"
            aria-label="Close job detail"
            onClick={close}
            variants={scrimVariants}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="absolute inset-0 cursor-default bg-black/60"
          />

          {/* The sheet */}
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={title ? `${title} — Job Detail` : "Job Detail"}
            tabIndex={-1}
            variants={sheetVariants}
            transition={
              reduced
                ? { duration: 0.18, ease: "easeOut" }
                : { type: "spring", stiffness: 340, damping: 36 }
            }
            className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[28px] bg-card shadow-[0_-12px_48px_rgba(0,0,0,0.28)] outline-none"
            style={{ height: `calc(100dvh - ${SHEET_TOP_GAP}px)` }}
          >
            {/* Header — back · centered title · share (reference anatomy) */}
            <div className="relative flex h-16 shrink-0 items-center justify-between border-b border-divider/70 px-4">
              <SheetCircleBtn label="Back" onClick={close}>
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </SheetCircleBtn>
              <h1 className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[17px] font-semibold text-ink">
                Job Detail
              </h1>
              <SheetCircleBtn label="Share this job" onClick={() => void share()} disabled={!job}>
                <Share className="h-[18px] w-[18px]" aria-hidden="true" />
              </SheetCircleBtn>
            </div>

            {/* Scroll region — bottom padding clears the floating CTA dock
                (44px capsule + gap + 54px pill + 12px bottom offset) so the
                last section scrolls fully into view past the floating pill */}
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+132px)] pt-4">
              {loading || (!job && !error) ? (
                /* Loading — the sheet frame is stable; the body skeletons. */
                <div className="space-y-5" aria-busy="true" aria-label="Loading position">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-14 w-14 rounded-2xl" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                    <Skeleton className="h-10 w-10 rounded-full" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-7 w-20 rounded-lg" />
                    ))}
                  </div>
                  <Skeleton className="h-10 w-full rounded-full" />
                  <div className="space-y-2.5 pt-1">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ) : error !== null ? (
                <Alert variant="destructive" open className="mt-2">
                  <AlertIcon />
                  <AlertContent>
                    <AlertDescription>{error}</AlertDescription>
                    <AlertAction>
                      <button
                        type="button"
                        onClick={onRetry}
                        className="inline-flex min-h-[44px] items-center text-sm font-medium text-metric-blue underline underline-offset-2"
                      >
                        Try again
                      </button>
                    </AlertAction>
                  </AlertContent>
                </Alert>
              ) : !job ? (
                <div className="dlg-card mt-2">
                  <EmptyState
                    icon={Search}
                    title="Position not found"
                    description="This position may have closed or is no longer published."
                  />
                </div>
              ) : (
                <>
                  {/* Company row — tile · title · employer · place · bookmark */}
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cloud text-xl font-bold text-ink"
                      aria-hidden="true"
                    >
                      M
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-bold leading-snug text-ink">{title}</h2>
                      <p className="mt-0.5 truncate text-sm text-stone">
                        DOST-MIRDC ·{" "}
                        {[
                          pos?.division ? divisionFullName(pos.division) : "Philippines",
                          pos?.section || null,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onSave}
                      aria-pressed={saved}
                      aria-label={
                        saved ? `Remove ${title} from saved jobs` : `Save ${title} to your list`
                      }
                      className="focus-ring -mr-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-stone transition-colors hover:bg-cloud hover:text-ink"
                    >
                      <Bookmark className={cn("h-5 w-5", saved && "fill-current text-metric-blue")} />
                    </button>
                  </div>

                  {/* Fact chips — first four + "+N" overflow (reference) */}
                  {visibleChips.length > 0 && (
                    <div className="mt-3.5 flex flex-wrap gap-2">
                      {visibleChips.map((chip) => (
                        <span
                          key={chip}
                          className="rounded-lg bg-cloud px-3 py-1.5 text-xs font-medium text-ink"
                        >
                          {chip}
                        </span>
                      ))}
                      {extraChips > 0 && (
                        <span className="rounded-lg bg-cloud px-3 py-1.5 text-xs font-medium text-stone">
                          +{extraChips}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Segmented pills — active tab wears the dark pill */}
                  <div
                    role="tablist"
                    aria-label="Position information sections"
                    className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-cloud/70 p-1"
                  >
                    {tabs.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        id={`job-sheet-tab-${t.id}`}
                        aria-selected={tab === t.id}
                        aria-controls={`job-sheet-panel-${t.id}`}
                        onClick={() => setTab(t.id)}
                        className={cn(
                          "focus-ring tap-44 min-h-[36px] rounded-full text-sm font-medium transition-colors",
                          tab === t.id
                            ? "text-white shadow-sm"
                            : "text-stone hover:text-ink"
                        )}
                        style={tab === t.id ? { background: SHEET_PILL_INK } : undefined}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Description tab */}
                  <div
                    role="tabpanel"
                    id="job-sheet-panel-description"
                    aria-labelledby="job-sheet-tab-description"
                    hidden={tab !== "description"}
                    className="pt-6"
                  >
                    <section aria-label="About this role">
                      <h2 className="text-lg font-bold text-ink">About this role</h2>
                      <div className={cn("mt-2", !briefOpen && "line-clamp-4")}>
                        <SheetRich html={job.briefDescriptionHtml} text={job.briefDescription} />
                        {!(job.briefDescriptionHtml?.trim() || job.briefDescription?.trim()) && (
                          <p className="text-[15px] text-stone">Not provided.</p>
                        )}
                      </div>
                      {(longBrief || briefOpen) && (
                        <button
                          type="button"
                          onClick={() => setBriefOpen((v) => !v)}
                          aria-expanded={briefOpen}
                          className="focus-ring mt-1.5 rounded-xs text-[15px] font-medium text-metric-blue underline-offset-2 hover:underline"
                        >
                          {briefOpen ? "Show less" : "Read more"}
                        </button>
                      )}
                    </section>
                    {/* Task 30 regroup — the offer facts under the role
                        description: compensation, the timeline and the
                        summary rows (the desktop aside's record). */}
                    <section aria-label="Compensation package" className="mt-7">
                      <h2 className="text-lg font-bold text-ink">Compensation Package</h2>
                      <div className="mt-2.5">
                        <SheetRich html={job.compensationHtml} text={job.compensationPackage} />
                        {!(job.compensationHtml?.trim() || job.compensationPackage?.trim()) && (
                          <p className="text-[15px] text-stone">Not provided.</p>
                        )}
                      </div>
                    </section>

                    <section aria-label="Timeline" className="mt-7">
                      {/* Task 91 (user request) — the Processing tile is gone
                          from the applicant/public sheet: the processing date
                          is an internal HR scheduling fact (staff still see it
                          in the job workspace record; the API nulls the field
                          for non-staff viewers). Published + Deadline remain. */}
                      <h2 className="text-lg font-bold text-ink">Timeline</h2>
                      <div className="mt-2.5 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-cloud/60 p-3">
                          <p className="text-xs text-body-gray">Published</p>
                          <p className="num mt-0.5 text-sm text-ink">{formatDate(job.publishDate ?? job.publishedAt)}</p>
                        </div>
                        <div className="rounded-xl bg-cloud/60 p-3">
                          <p className="text-xs text-body-gray">Deadline</p>
                          <p
                            className={`num mt-0.5 flex items-center gap-1 text-sm ${
                              overdue ? "text-[var(--bad)]" : "text-ink"
                            }`}
                          >
                            {overdue && <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                            {formatDate(job.deadlineDate)}
                          </p>
                        </div>
                      </div>
                    </section>

                    <section aria-label="Position summary" className="mt-7">
                      <h2 className="text-lg font-bold text-ink">Position summary</h2>
                      <ul className="mt-1 divide-y divide-border">
                        {summaryRows.map(({ icon: Icon, value, caption, rowOverdue }) => (
                          <li key={caption} className="flex items-center gap-3 py-3.5">
                            <Icon
                              className={cn(
                                "h-4 w-4 shrink-0",
                                rowOverdue ? "text-[var(--bad)]" : "text-body-gray"
                              )}
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1">
                              <span
                                className={cn(
                                  "num block truncate text-sm font-medium",
                                  rowOverdue ? "text-[var(--bad)]" : "text-ink"
                                )}
                                title={value}
                              >
                                {value}
                              </span>
                              <span className="block text-xs text-body-gray">{caption}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>

                  {/* Requirements tab — Qualifications + MQR + the folded Key
                      Competency (Task 30 regroup). The Company tab is retired
                      with it — its agency block restated the header
                      attribution (Task 29). */}
                  <div
                    role="tabpanel"
                    id="job-sheet-panel-requirements"
                    aria-labelledby="job-sheet-tab-requirements"
                    hidden={tab !== "requirements"}
                    className="pt-6"
                  >
                    <SheetBullets
                      title="Qualifications"
                      html={job.otherQualificationsHtml}
                      text={job.otherQualifications}
                    />
                    <section aria-label="Minimum qualification requirements" className="mt-7">
                      <h2 className="text-lg font-bold text-ink">Minimum Qualification Requirements</h2>
                      <div className="mt-1">
                        {visibleMqr.length > 0 ? (
                          visibleMqr.map(([label, value], i) => (
                            <div key={label} className={cn("py-3.5", i > 0 && "border-t border-border")}>
                              <p className="text-sm font-medium text-ink">{label}</p>
                              <p className="mt-1 text-sm leading-relaxed text-stone">{value}</p>
                            </div>
                          ))
                        ) : (
                          <p className="py-3.5 text-sm text-stone">
                            No minimum requirements published for this position.
                          </p>
                        )}
                      </div>
                    </section>
                    {/* Task 25/26 — Key Competency on the mobile sheet, folded. */}
                    {job.position?.keyCompetency?.trim() && (
                      <CollapsibleSection title="Key Competency" className="mt-7" headingClassName="text-lg">
                        <RichOrPlain html={job.position.keyCompetency} text={null} />
                      </CollapsibleSection>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Floating CTA dock — the Apply button wears the mobile tab
                bar's EXACT floating geometry: 16px side insets (px-4), 12px +
                safe-area off the bottom (the nav wrapper's literal pb token),
                the nav's shadow. It overlays the scrolling content like the
                nav overlays the page — pointer-events stay on the pills so
                scrolling over the dock still works. */}
            {!loading && error === null && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)]">
                {job ? (
                  <>
                    {overdue && !applied && (
                      <div className={floatingNoteCapsule}>
                        The deadline for this position has passed.
                      </div>
                    )}
                    {applied && (
                      <div className={floatingNoteCapsule}>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        You applied to this position
                      </div>
                    )}
                    {applied ? (
                      /* Applied — the CTA pill itself becomes the withdraw
                         action (user direction): "Cancel Application" opens
                         the confirm dialog; the capsule above carries the
                         applied signal. Still cancellable past the deadline. */
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            type="button"
                            className={floatingApplyPill}
                            style={floatingPillRadius}
                            disabled={cancelling}
                          >
                            Cancel Application
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="dlg-card-plain">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="font-display text-2xl text-ink">
                              Cancel this application?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-sm text-body-gray">
                              Your application for {title} will be withdrawn. You can apply again
                              while the position is open.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="dlg-ghost min-h-[44px] px-6 text-sm">
                              Keep application
                            </AlertDialogCancel>
                            <AlertDialogAction onClick={onCancelApplication} className={`${ghostBadBtn} px-6`}>
                              Cancel application
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : (
                      <button
                        type="button"
                        onClick={onApply}
                        disabled={overdue}
                        className={floatingApplyPill}
                        style={floatingPillRadius}
                      >
                        {ctaLabel}
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={close}
                    className={floatingApplyPill}
                    style={floatingPillRadius}
                  >
                    Back to Job Opportunities
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

export default function JobPostingDetail() {
  const route = useHashRoute();
  const detailParam = route.params.job ?? null;
  const { user } = useSession();
  // Drawer bookmarks share the board's localStorage store, and the portal
  // waits one effect so createPortal never runs during SSR.
  const { saved: savedIds, toggle: toggleSaveJob } = useSavedJobs();
  const [portalReady, setPortalReady] = useState(false);

  // Shell contract (previous-RMIS responsive fix 3-a): PublicShell's <main>
  // is a bare flex column (no padding), so the anonymous page paints its own
  // 1600px public-grid container + gutters; AppShell's <main> already
  // carries the workspace container, so signed-in views stay a plain w-full.
  // Mobile drawer pass: below lg the PAGE is display:none — the drawer
  // (portaled to body) is the complete detail there — so both trees render
  // from the same state with no hydration flash.
  const shellPad = user
    ? "hidden w-full lg:block"
    : "mx-auto hidden w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:block lg:px-8";

  const [jobs, setJobs] = useState<JobWire[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastJson = useRef("");
  const [cancelling, setCancelling] = useState(false);
  const { requestApply, dialogs } = useApplyFlow();

  const load = useCallback(async (silent: boolean) => {
    try {
      const data = await apiFetch<JobWire[]>("/api/jobs?limit=200");
      const json = JSON.stringify(data);
      if (!silent || json !== lastJson.current) {
        lastJson.current = json;
        setJobs(data);
      }
      setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load the position");
    }
  }, []);

  // Mount + 30s silent poll + refetch on focus — keeps the Applied state and
  // the deadline lock truthful while the page is open.
  useEffect(() => {
    void load(false);
    const timer = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 30_000);
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Cancel application (only while an ACTIVE application exists — spec §7.7).
  const appliedId = useMemo(() => {
    const detail = detailParam ? (jobs ?? []).find((j) => j.id === Number(detailParam)) : null;
    return detail?.applications?.find((a) => isActiveApplicationStatus(a.status))?.id ?? null;
  }, [detailParam, jobs]);

  const cancelApplication = useCallback(async () => {
    if (appliedId == null) return;
    setCancelling(true);
    try {
      await apiFetch(`/api/applications/${appliedId}`, { method: "DELETE" });
      toast.success("Application cancelled", {
        description: "Your application was withdrawn. You can apply again while the position is open.",
      });
      await load(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel the application");
    } finally {
      setCancelling(false);
    }
  }, [appliedId, load]);

  const applyTo = useCallback(
    (job: JobWire) => {
      requestApply(job);
    },
    [requestApply]
  );

  // QA 2026-10-21 (user bug report) — every back affordance on this view
  // (mobile drawer close, desktop "Back" crumb, not-found CTA) must hand the
  // visitor back to the surface they actually came from: anonymous users
  // arrive here from the front-page explorer's View Details button, so they
  // return to the front page (the landing IS the public Job Opportunities
  // page — navigating "home" renders PublicLanding when signed out), while
  // signed-in members return to the board they browsed.
  const backToJobs = useCallback(() => {
    if (user) navigate("job-opportunities");
    else navigate("home");
  }, [user]);

  // Board-shared bookmark toggle with the board's toast wording.
  const saveAndToast = useCallback(
    (job: JobWire) => {
      const wasSaved = savedIds.includes(job.id);
      toggleSaveJob(job.id);
      toast.success(
        wasSaved
          ? "Removed from your saved jobs"
          : `Saved ${humanize(job.position?.positionTitle || job.title)}`
      );
    },
    [savedIds, toggleSaveJob]
  );

  useEffect(() => setPortalReady(true), []);

  // ── Detail mode ───────────────────────────────────────────────────────────
  if (!detailParam || !/^\d+$/.test(detailParam)) return null;

  const detailId = Number(detailParam);
  const detail = jobs?.find((j) => j.id === detailId) ?? null;
  const applied = !!detail && (detail.applications ?? []).some((a) => isActiveApplicationStatus(a.status));
  const priorAttempt = !!detail && !applied && (detail.applications?.length ?? 0) > 0;
  const overdue = !!detail && deadlineState(detail.deadlineDate).overdue;

  // ── Both surfaces from ONE state (no hydration flash) ────────────────────
  // The page div below is hidden lg:block (the mobile drawer replaces it),
  // and the drawer is portaled to body inside an lg:hidden root so the
  // desktop page stays pixel-identical.
  return (
    <>
      <div className={shellPad}>
      <button
        onClick={backToJobs}
        className="focus-ring mb-5 flex min-h-[44px] items-center gap-2 rounded-xs text-sm text-body-gray hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Job Opportunities
      </button>

      {jobs === null && error === null ? (
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
          <div>
            <div className="space-y-3">
              <Skeleton className="h-9 w-3/4 max-w-sm" />
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="mt-7 space-y-3 border-t border-border pt-6">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          <div className="space-y-6">
            <div className="dlg-card-plain space-y-4 border border-border p-6">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-px w-full" />
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-px w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
            <div className="dlg-card-plain space-y-3 border border-border p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        </div>
      ) : error !== null ? (
        <ErrorCard description={error} onRetry={() => void load(false)} />
      ) : detail === null ? (
        <div className="dlg-card">
          <EmptyState
            icon={Search}
            title="Position not found"
            description="This position may have closed or is no longer published."
            action={
              <button onClick={backToJobs} className={`${INK_CTA} px-7`}>
                Back to Job Opportunities
              </button>
            }
          />
        </div>
      ) : (
        // The EXACT reference anatomy: plain typographic main column (no
        // card) + a 340px sticky aside of two hairline cards. The MAIN
        // column is first in the DOM so phones read the posting first; the
        // header's lg:hidden CTA keeps the apply action above their fold.
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
          <div className="min-w-0">
            <PostingHeader job={detail} signedIn={!!user} onApply={applyTo} />
            <DetailTabs job={detail} />
          </div>
          {/* Session-aware sticky offset: the public SiteHeader is sticky
              h-16, the signed-in shell has no sticky chrome at lg+. */}
          <aside aria-label="Position summary" className={`space-y-6 lg:sticky ${user ? "lg:top-6" : "lg:top-20"}`}>
            <SummaryCard
              job={detail}
              signedIn={!!user}
              onApply={applyTo}
              onCancel={() => void cancelApplication()}
              cancelling={cancelling}
            />
            {/* Agency mini-card REMOVED (user: it restated the division the
                header attribution already carries). */}
          </aside>
        </div>
      )}

      {dialogs}
      </div>
      {portalReady &&
        createPortal(
          <div
            className="lg:hidden"
            /* React portals bubble synthetic events through the REACT tree,
               not the DOM tree — and this portal is a React descendant of
               AppShell's PullToRefresh container. Without this boundary the
               pull block's onPointerDown fires for drawer presses, captures
               the pointer onto the scroller and silently kills every click
               in the drawer (mouse/pen only — touch pointers skip the
               capture, which is why the bug hides on real phones).
               Stopping the synthetic propagation here ends the portal's
               React-tree climb; native document-level listeners (outside
               click, Radix) still see the DOM event normally. */
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <MobileDetailSheet
              job={detail}
              loading={jobs === null && error === null}
              error={error}
              signedIn={!!user}
              saved={!!detail && savedIds.includes(detail.id)}
              applied={applied}
              priorAttempt={priorAttempt}
              overdue={overdue}
              cancelling={cancelling}
              onSave={() => detail && saveAndToast(detail)}
              onApply={() => detail && applyTo(detail)}
              onCancelApplication={() => void cancelApplication()}
              onRetry={() => void load(false)}
              onBack={backToJobs} /* QA 2026-10-21: anonymous users return to the front page, members to the board */
            />
          </div>,
          document.body
        )}
    </>
  );
}
