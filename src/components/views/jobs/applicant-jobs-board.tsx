"use client";

// ============================================================================
// RMIS — Applicant "Job Opportunities" explorer (the frontpage board, brought
// into the workspace). QA 2026-10: the staff Jobs board is RETIRED — the
// route now renders this frontpage-style explorer for
// EVERYONE: applicants, and anonymous visitors straight from the public
// frontpage's "View All Jobs" (the old staff-style board page and its
// jobs-view.tsx codebase are deleted).
//   TOP   · the "Hero Sky" rounded-3xl field carrying the "Job Opportunities"
//           display headline (same anatomy as the frontpage).
//   LEFT  · single-line [search bar] + [Sort] over a register of Cloud Card
//           job cards (clickable summary · division name · place · salary ·
//           clamped snippet · posted age · chevron quick-view + bookmark).
//   RIGHT · the full posting pane — display title, icon meta rows with full
//           division names, posted age, brand-blue Apply + ghost Save,
//           description, Responsibilities / Qualifications / Compensation.
//           The pane is sticky: it grows to full content height when the
//           screen has room and caps at the live viewport (scrolling
//           internally while pinned) when it doesn't. The board row reserves
//           100dvh + 128px so the pane always has travel room.
//   Mobile swaps panes (list → detail with back).
// Applicant deltas vs the public frontpage (deliberate, minimal):
//   · the gold "Applied" pill on cards and the posting pane (from the
//     session-personalized applications array on each job),
//   · Apply routes to the DEDICATED complete-posting page
//     (#/job-opportunities?job=<id>) instead of opening the apply modal —
//     the whole apply/cancel flow (and its gate) lives there; the pane
//     button still disables once an active application exists (tracking and
//     cancellation stay on the home journey cards, exactly as before),
//   · deep links (#/job-opportunities?job=<id>) preselect that posting — the
//     home quick-view's "Read full description" now deep-links to the
//     DEDICATED complete-posting page (#/job-opportunities?job=<id>, see
//     jobs/job-posting-detail.tsx) instead of this list; only "View All" lands
//     here. The deep link stays for legacy bookmarks.
// Data: GET /api/jobs?limit=200 (30s silent poll + refetch on focus — the
// §13 cadence); saves persist in localStorage (lib/use-saved-jobs); applying
// hands off to the dedicated posting page (no modal on the board itself —
// that page carries the shared useApplyFlow gate: sign-in /
// profile-completeness / MQR).
// The posting pane anatomy (JobDetail + sections) lives in the shared
// jobs/posting-detail.tsx — the #/job-detail page renders the same component.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Bookmark,
  Briefcase,
  ChevronDown,
  Inbox,
  Search,
} from "lucide-react";
import { ChromaticTextReveal } from "@/components/beui/chromatic-text-reveal";
import { toast } from "@/lib/toast";
import { EmptyState, StatusPill } from "@/components/ui/shell";
import { ctaBtn } from "@/components/ui/buttons";
import { Alert, AlertAction, AlertContent, AlertDescription, AlertIcon } from "@/components/motion/alert";
import { Input } from "@/components/motion/input";
import {
  MorphSelect,
  MorphSelectContent,
  MorphSelectItem,
  MorphSelectTrigger,
  MorphSelectValue,
} from "@/components/motion/select-morph";
import { apiFetch, deadlineState, formatCurrency, humanize, timeAgo } from "@/lib/client";
import { divisionFullName } from "@/lib/constants";
import { useSavedJobs } from "@/lib/use-saved-jobs";
import { navigate, useHashRoute, type JobWire } from "@/lib/router";
import { jobPlace, postedAt, jobDeadlinePassed } from "@/lib/job-meta";
import { isActiveApplicationStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { JobDetail } from "./posting-detail";

// ── Board vocabulary (shared with the frontpage) ────────────────────────────

const TITLE_SELECTED = "text-metric-blue";

type SortKey = "newest" | "deadline" | "salary";

// ── Job card (left register — the frontpage card + Applied pill) ───────────
// MOM 2026-10-20 — quick view slimmed to the job description only (the
// facts grid is gone — the detail pane/posting page carries the complete
// facts). Phones: the card summary is static text and the expansion's
// View Details button routes to the complete posting page (?job=<id>).
// User QA 2026-10-21 (mobile dropdown): the expansion now carries ONLY the
// View Details button — the description/qualifications preview is gone from
// the dropdown (it repeated what the complete posting page shows; the
// complete posting is one tap away).

/** The board's job card — ALSO the Bookmarked-Jobs card on the applicant
 *  home (exported; user directive 2026-10-21: "change it with the same card
 *  we used on the job opportunities page, just don't include its dropdown").
 *  QUICK-VIEW CHEVRON IS MOBILE-ONLY (user directive 2026-10-21): on desktop
 *  the dropdown is redundant — selecting the card drives the full posting
 *  pane right beside the list — so the chevron renders only when the card
 *  is NOT interactive (phones). Omit `onToggle` entirely to hard-hide it
 *  (the home does this). Phones: the card summary is static text and the
 *  expansion's View Details button routes to the complete posting page
 *  (?job=<id>). User QA 2026-10-21 (mobile dropdown): the expansion carries
 *  ONLY the View Details button — no description/qualifications preview. */
export function JobListCard({
  job,
  selected,
  expanded,
  saved,
  applied,
  interactive,
  onSelect,
  onToggle,
  onSave,
  onOpenDetails,
}: {
  job: JobWire;
  selected?: boolean;
  expanded?: boolean;
  saved: boolean;
  applied?: boolean;
  /** Desktop only — phones render the summary as static text; the quick
 *      view's View Details button is the mobile path to the full posting. */
  interactive: boolean;
  onSelect: () => void;
  /** Omit to hard-hide the quick-view chevron (desktop board + home). */
  onToggle?: () => void;
  onSave: () => void;
  onOpenDetails: () => void;
}) {
  const reduced = useReducedMotion();
  const pos = job.position;
  const title = pos?.positionTitle || job.title || "Position Title Unavailable";
  const company = pos?.division ? divisionFullName(pos.division) : "DOST-MIRDC";
  const salary = pos?.salaryAmount ?? null;
  const deadline = job.deadlineDate;
  const overdue = jobDeadlinePassed(deadline);

  // Summary block shared by the desktop select target and its mobile
  // static-text fallback (MOM 2026-10-20: phones don't swap panes from the
  // card anymore, so the summary must not read as a control there).
  const summary = (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3
          className={cn(
            "min-w-0 text-lg font-medium leading-snug",
            selected ? TITLE_SELECTED : "text-ink"
          )}
        >
          {humanize(title)}
        </h3>
        {applied && <StatusPill status="Applied" variant="info" className="shrink-0" />}
      </div>
      {/* Division/agency de-emphasized to the 14px/500 meta step — it must
          read as an attribution, never as a second title. */}
      {/* Task 29 (user QA) — the jobPlace line is gone: it repeated the
          division attribution right above verbatim, so the card read the
          same division name twice. */}
      <p className="mt-1 text-sm font-medium text-ink">{company}</p>
      {salary != null && <p className="num mt-0.5 text-sm text-stone">{formatCurrency(salary)} per month</p>}
      {job.briefDescription && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone">{job.briefDescription}</p>
      )}
    </>
  );

  return (
    <article className={cn("dlg-card lift", selected && "ring-2 ring-metric-blue/60")}>
      {/* Select target — title, company, vitals, snippet. Desktop taps it to
          drive the detail pane; phones get plain text. */}
      {interactive ? (
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected ? "true" : undefined}
          aria-label={`View ${humanize(title)}`}
          className="focus-ring block w-full px-4 pt-4 text-left sm:px-5 sm:pt-5"
        >
          {summary}
        </button>
      ) : (
        <div className="block w-full px-4 pt-4 text-left sm:px-5 sm:pt-5">{summary}</div>
      )}

      {/* Bottom register — posted age left, quick-view + bookmark right */}
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2 sm:px-3.5">
        {interactive ? (
          <button
            type="button"
            onClick={onSelect}
            className="focus-ring num rounded-full px-2 py-1.5 text-xs text-stone transition-colors hover:text-ink"
            aria-label={`Open ${humanize(title)}`}
          >
            {timeAgo(postedAt(job))}
          </button>
        ) : (
          <span className="num rounded-full px-2 py-1.5 text-xs text-stone">{timeAgo(postedAt(job))}</span>
        )}
        <div className="flex items-center">
          {/* Quick-view chevron — MOBILE ONLY (user directive 2026-10-21):
              on desktop the description already lives in the pane beside
              the list, so the dropdown is redundant and is not rendered. */}
          {!interactive && onToggle && (
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
          )}
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

      {/* Quick view — inline expansion, reachable from MOBILE only now
          (the chevron that opens it is hidden on desktop). User QA
          2026-10-21: the dropdown carries ONLY the View Details button —
          the description/qualifications preview is gone (the complete
          posting page is where that content lives, one tap away). House
          ease; reduced-motion users get a plain opacity crossfade. */}
      <AnimatePresence initial={false}>
        {expanded && onToggle && (
          <motion.div
            key="quickview"
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={
              reduced
                ? { duration: 0.15, ease: "linear" }
                : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }
            }
            className="overflow-hidden"
          >
            <div className="border-t border-divider px-4 pb-6 pt-4 sm:px-5">
              {/* Phones: the card summary is static text, so this button is
                  the path from the card to the complete posting page
                  (#/job-opportunities?job=<id>). Desktop hides it —
                  selecting the card drives the pane beside the list. */}
              <button
                type="button"
                onClick={onOpenDetails}
                aria-label={`View details: ${humanize(title)}`}
                className={cn(ctaBtn, "focus-ring w-full lg:hidden")}
              >
                View Details <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

export default function ApplicantJobsBoard() {
  const route = useHashRoute();
  // Deep link (#/job-opportunities?job=<id> — legacy bookmarks/links; the home
  // quick-view's "Read full description" goes to the dedicated
  // #/job-opportunities?job=<id> detail page now) preselects that posting
  // once jobs arrive.
  const deepJobId = route.params.job ? Number(route.params.job) : null;

  const [jobs, setJobs] = useState<JobWire[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Last non-null error — keeps the BEUI alert's exit animation populated with
  // content while the message state has already cleared.
  const [lastError, setLastError] = useState<string | null>(null);
  useEffect(() => {
    if (error !== null) setLastError(error);
  }, [error]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Single-line browse filter — the frontpage's [search bar] + [Sort] row.
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [isDesktop, setIsDesktop] = useState(false);
  const lastJson = useRef("");
  const paneRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { saved, toggle: toggleSave } = useSavedJobs();

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
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load positions");
    }
  }, []);

  // Mount + 30s silent poll + refetch on focus (spec §13 cadence).
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

  // Breakpoint sync — desktop keeps both panes; mobile swaps list ↔ detail.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const openJobs = useMemo(
    () => (jobs ?? []).filter((j) => !deadlineState(j.deadlineDate).overdue),
    [jobs]
  );

  // Active-application map — the gold "Applied" pill source. The jobs API
  // personalizes `applications` per job for the signed-in applicant.
  const appliedIds = useMemo(() => {
    const set = new Set<number>();
    for (const j of jobs ?? []) {
      if ((j.applications ?? []).some((a) => isActiveApplicationStatus(a.status))) set.add(j.id);
    }
    return set;
  }, [jobs]);

  // Filter + sort over the open corpus — the needle covers every line the
  // register cards actually display: title, position title, item number and
  // division name (Task 24 retired place of assignment). Sort = the
  // frontpage trio (Newest · Deadline · Salary desc).
  const filteredOpenJobs = useMemo(() => {
    let list = openJobs;
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter((j) =>
        `${j.title} ${j.position?.positionTitle ?? ""} ${j.position?.itemNumber ?? ""} ${
          j.position?.division ? divisionFullName(j.position.division) : ""
        } ${jobPlace(j)}`
          .toLowerCase()
          .includes(needle)
      );
    }
    const deadlineTime = (j: JobWire) =>
      j.deadlineDate ? new Date(j.deadlineDate).getTime() : Number.POSITIVE_INFINITY;
    const sorted = [...list];
    if (sort === "newest") {
      sorted.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    } else if (sort === "deadline") {
      sorted.sort((a, b) => deadlineTime(a) - deadlineTime(b));
    } else {
      sorted.sort((a, b) => (b.position?.salaryAmount ?? -1) - (a.position?.salaryAmount ?? -1));
    }
    return sorted;
  }, [openJobs, query, sort]);

  const selectedJob = useMemo(
    () => openJobs.find((j) => j.id === selectedId) ?? null,
    [openJobs, selectedId]
  );

  // Deep-link preselect: once jobs are in, select the requested posting (no
  //-op when it is already selected). Closed/filtered targets fall through to
  // the desktop auto-select below / the plain register on mobile.
  useEffect(() => {
    if (deepJobId == null || Number.isNaN(deepJobId) || jobs === null) return;
    if (openJobs.some((j) => j.id === deepJobId)) setSelectedId(deepJobId);
  }, [deepJobId, jobs, openJobs]);

  // Desktop opens with the first posting pre-selected (frontpage behavior)
  // and snaps to the top of the FILTERED register whenever the current
  // selection is filtered out (search/sort) or closed by a poll — the
  // posting pane never lags the register.
  useEffect(() => {
    if (
      isDesktop &&
      filteredOpenJobs.length > 0 &&
      !filteredOpenJobs.some((j) => j.id === selectedId)
    ) {
      setSelectedId(filteredOpenJobs[0].id);
    }
  }, [isDesktop, filteredOpenJobs, selectedId]);

  useEffect(() => {
    if (selectedId !== null && !openJobs.some((j) => j.id === selectedId)) {
      setSelectedId(openJobs[0]?.id ?? null);
    }
  }, [openJobs, selectedId]);

  // Reference-board behavior — a freshly picked posting opens from the top,
  // even when the previous posting was scrolled deep into its body.
  useEffect(() => {
    if (paneRef.current) paneRef.current.scrollTop = 0;
  }, [selectedId]);

  // Mobile pane swap scroll — inside the workspace shell the page does NOT
  // scroll on phones (the shell's PullToRefresh container is the scroller),
  // so climbing to the nearest scrollable ancestor beats window.scrollTo.
  const swapScrollTop = useCallback(() => {
    let el = rootRef.current?.parentElement ?? null;
    while (el) {
      const style = window.getComputedStyle(el);
      if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll|overlay)/.test(style.overflowY)) {
        el.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      el = el.parentElement;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const select = useCallback(
    (id: number) => {
      setSelectedId(id);
      if (!window.matchMedia("(min-width: 1024px)").matches) swapScrollTop();
    },
    [swapScrollTop]
  );

  const saveAndToast = useCallback(
    (job: JobWire) => {
      const wasSaved = saved.includes(job.id);
      toggleSave(job.id);
      toast.success(
        wasSaved
          ? "Removed from your saved jobs"
          : `Saved ${humanize(job.position?.positionTitle || job.title)}`
      );
    },
    [saved, toggleSave]
  );

  const showList = isDesktop || selectedId === null;
  const showDetail = isDesktop || selectedId !== null;

  return (
    // The workspace shell owns the page chrome (nav rail, breadcrumb, footer)
    // — this view carries the frontpage board anatomy: the Hero Sky field,
    // the [search + sort] row, the card register and the sticky posting pane.
    <div ref={rootRef} className="flex min-h-full flex-col">
      {/* Hero — the frontpage's "Hero Sky" wash field anchoring the explorer.
          F2/F6 (UI review 2026-10-20): the headline rides the view-display
          step (32px) at every width. It used to be 30px on phones and jump to
          text-display from sm up — a two-step ladder pointing the wrong way
          once text-display became the 24px PAGE TITLE step. */}
      <section className="hero-sky rounded-3xl p-4 sm:p-6 lg:px-8 lg:py-7">
        <h1 className="font-display text-view-display text-ink">
          {/* Task 30 (user direction) — the applicant board rides the SAME
              beui chromatic reveal as the frontpage: "Job Opportunities"
              ⇄ "Job Openings" — one chromatic sweep, a 10-second rest, then
              the next word. The sr-only span inside keeps the heading
              readable; the sizing words keep the h1 from shifting as the
              word swaps. */}
          <ChromaticTextReveal
            prefix="Job"
            words={["Opportunities", "Openings"]}
            foregroundColor="var(--color-ink)"
            pauseDuration={10}
          />
        </h1>
      </section>

      <Alert variant="destructive" open={error !== null} className="mt-6">
        <AlertIcon />
        <AlertContent>
          <AlertDescription>{error ?? lastError}</AlertDescription>
          {error !== null && (
            <AlertAction>
              <button
                onClick={() => void load(false)}
                className="inline-flex min-h-[44px] items-center text-sm font-medium text-metric-blue underline underline-offset-2"
              >
                Try again
              </button>
            </AlertAction>
          )}
        </AlertContent>
      </Alert>
      {error !== null ? null : jobs === null ? (
        <div className="mt-6 space-y-3.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skel h-28" />
          ))}
        </div>
      ) : openJobs.length === 0 ? (
        <div className="dlg-card mt-6">
          <EmptyState
            icon={Inbox}
            title="No open positions right now"
            description="Check back soon for upcoming announcements."
          />
        </div>
      ) : (
        // Frontpage two-pane board — the posting pane sizes to its own
        // content, capped at the LIVE viewport height; the register is a
        // plain block that scrolls with the page. The grid row reserves
        // 100dvh + 128px so the sticky pane keeps travel room even when the
        // register is shorter than the posting (see the frontpage notes).
        <div className="mt-6 grid gap-8 sm:mt-8 lg:min-h-[calc(100dvh+128px)] lg:grid-cols-[minmax(340px,430px)_minmax(0,1fr)]">
          {/* Left · the register */}
          {showList && (
            <div aria-label="Job opportunities list" className="scroll-thin">
              {/* Single-line browse filter — [search bar] + [Sort] on one
                  row above the register (the frontpage pattern). */}
              <div className="flex items-center gap-2">
                <Input
                  id="applicant-board-search"
                  aria-label="Search positions"
                  leftIcon={<Search />}
                  value={query}
                  onChange={setQuery}
                  placeholder="Search positions…"
                  className="min-w-0 flex-1"
                />
                <MorphSelect
                  className="w-[124px] shrink-0"
                  value={sort}
                  onValueChange={(v) => setSort(v as SortKey)}
                >
                  <MorphSelectTrigger className="min-h-[44px]">
                    <span className="sr-only">Sort job openings</span>
                    <MorphSelectValue />
                  </MorphSelectTrigger>
                  <MorphSelectContent>
                    <MorphSelectItem value="newest">Newest</MorphSelectItem>
                    <MorphSelectItem value="deadline">Deadline</MorphSelectItem>
                    <MorphSelectItem value="salary">Salary desc</MorphSelectItem>
                  </MorphSelectContent>
                </MorphSelect>
              </div>

              {filteredOpenJobs.length === 0 ? (
                <div className="dlg-card mt-3.5">
                  <EmptyState
                    icon={Search}
                    title="No positions match your search"
                    description="Try a different term or clear the search to see every opening."
                    action={
                      <button
                        onClick={() => setQuery("")}
                        className="dlg-ghost min-h-[44px] px-6 text-sm"
                      >
                        Clear search
                      </button>
                    }
                  />
                </div>
              ) : (
                <div className="mt-3.5 space-y-3.5">
                  {filteredOpenJobs.map((job) => (
                    <JobListCard
                      key={job.id}
                      job={job}
                      selected={selectedId === job.id}
                      expanded={expandedId === job.id}
                      saved={saved.includes(job.id)}
                      applied={appliedIds.has(job.id)}
                      interactive={isDesktop}
                      onSelect={() => select(job.id)}
                      onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)}
                      onSave={() => saveAndToast(job)}
                      onOpenDetails={() => navigate("job-opportunities", { job: String(job.id) })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Right · the posting — ONE sticky, viewport-capped scroller. The
              workspace shell has no sticky header above the content column
              on desktop, so the pin offset is the grid's own breathing room. */}
          {showDetail && (
            <div
              ref={paneRef}
              className="scroll-thin lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:pr-2"
            >
              {selectedJob ? (
                <div className="dlg-card p-6 sm:p-8">
                  <JobDetail
                    job={selectedJob}
                    saved={saved.includes(selectedJob.id)}
                    applied={appliedIds.has(selectedJob.id)}
                    onApply={() => navigate("job-opportunities", { job: String(selectedJob.id) })}
                    onSave={() => saveAndToast(selectedJob)}
                    onBack={() => setSelectedId(null)}
                  />
                </div>
              ) : (
                <div className="dlg-card">
                  <EmptyState
                    icon={Briefcase}
                    title="Select a position"
                    description="Choose a role from the list to read the full posting."
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
