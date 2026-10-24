"use client";

// ============================================================================
// RMIS — Evaluator review queue (spec §7.8). List (default) and Kanban modes
// over /api/evaluator/queue. 15 s silent poll + focus refresh + manual refresh.
// Stage tabs (list), bulk regret letters with confirm. (User direction
// 2026-10: the "Qualified only" lens was removed — the queue always shows
// every application.) Card / row review actions open the ReviewWorkspace in a
// Dialog. List rows carry an always-visible labeled Review button in the
// primary blue capsule (user direction — no hover-reveal arrow; blue fill for
// UI consistency with the stage tabs). Bevel pass: shared page-header anatomy
// + cloud stat cards, capsule segmented toggles, white hairline table-card,
// quiet round row actions. 4-column kanban keeps the shared reference-board
// primitives (dot+label+count columns, pastel avatars, match badge, credential
// tags). Handlers byte-identical.
// Task 11 (user direction): the cross-job "Send interview invitations" bulk
// send was REMOVED from this queue — it emailed every shortlisted applicant
// across ALL postings at once. The send now lives per job listing on the
// Jobs table (recruitment) and the Job workspace Pipeline tab, where the
// cohort is naturally scoped to that one posting.
// Open-profile removal (user direction 2026-10): the "Open profile" quick
// action left BOTH surfaces — the kanban cards' hover icon and the list
// action cell. The ReviewWorkspace already carries the candidate's full
// dossier; a second door onto the profile page was visual noise on the
// cards and a dead extra click in the table.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import {
  ArrowUpRight, Inbox, LayoutGrid, List, MailX, UserRound,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  EmptyState, ErrorCard, FilterChip, IconChip, NoteBanner, PageHeader, PriorRejectionPill, RefreshButton, SegmentedControl,
  SkeletonKanban, SkeletonRows, StatusPill, VerdictPill, dialogScroll,
} from "@/components/ui/shell";
import { ghostBadModifier, ghostBadBtn } from "@/components/ui/buttons";
import {
  KanbanAvatar, KanbanCardBody, KanbanColumn, KANBAN_BOARD_CLASS, KANBAN_CARD, StageDot,
} from "@/components/ui/kanban";
import { apiFetch, appliedAgo, formatDate, fullName, humanize } from "@/lib/client";
import { PIPELINE_STAGES, stageForStatus, type StageKey } from "@/lib/status";
import { bucketByStage, fetchQueue, type QueueRow } from "@/lib/pipeline-board";
import { divisionFullName } from "@/lib/constants";
import { useSession } from "@/components/session-provider";
import { useFocusRefresh } from "@/lib/use-focus-refresh";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ReviewWorkspace } from "@/components/views/review-workspace";
// BEUI Phase 5 — official virtualized Table (beui.dev/r/table, vendored
// verbatim at src/components/motion/table). Alignment only via sanctioned props.
import { Table, type TableColumn } from "@/components/motion/table";

// ── Wire shapes ─────────────────────────────────────────────────────────────

// QueueRow (the /api/evaluator/queue wire) lives in lib/pipeline-board.ts —
// the ONE client seam for every staff board (Task 81-b).

type RegretSummary = {
  total: number;
  sent: number;
  alreadySent: number;
  shortlisted: number;
  failed: number;
  notFound: number;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReviewQueue() {
  // QA 2026-02: administrators can assist with review activities — the scope
  // note below makes that access explicit to avoid evaluator overlap.
  const { user } = useSession();
  const isAdmin = user?.role === "ADMIN";
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // QA 2026-02 (user direction): List is the default working surface — the
  // kanban board stays available as the secondary spatial overview.
  const [mode, setMode] = useState<"kanban" | "list">("list");
  const [listStage, setListStage] = useState<"All" | StageKey>("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [regretOpen, setRegretOpen] = useState(false);
  const [regretBusy, setRegretBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const q = await fetchQueue();
      setQueue(q);
      if (!silent) setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load the review queue");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 15 s silent poll + refetch-on-focus (spec §13).
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 15_000);
    return () => clearInterval(id);
  }, [load]);
  useFocusRefresh(() => void load(true));

  const applications = useMemo(() => queue ?? [], [queue]);
  const listRows = useMemo(
    () => (listStage === "All" ? applications : applications.filter((r) => stageForStatus(r.status) === listStage)),
    [applications, listStage]
  );

  // BEUI Phase 5 — column defs for the official Table. Review/View is the
  // labeled, always-visible button per QA 2026-02 (user direction). The
  // Open-profile shortcut that used to ride in this action cell is retired
  // (user direction 2026-10) — the review workspace carries the dossier.
  // QA 2026-02 fix — the two text columns are flexible (no declared width)
  // and the fixed widths sum to ~510px, so the table fits the 960px card at
  // the default 1280×720 laptop viewport. The old fixed 280+220+140+150+140
  // +190 = 1120px forced a horizontal overflow that pushed the Review/View
  // buttons outside the viewport — clicks looked completely dead.
  const ROW_H = 64;
  // Task 39 (per user, mobile) — responsive columns at the call site: below
  // md the 510px fixed widths crush the two flexible columns to the block's
  // 64px floor. Phones get a 3-column set that fits the viewport — Candidate
  // (flexible, avatar hidden, the POSITION folded into the subtitle), Status,
  // and a single Review/View action (the profile button lives inside the
  // review workspace). sm+ keeps the full 7-column table.
  const isMobile = useIsMobile();
  // Task 81-b — the status stack and the action capsule below are byte-
  // identical at BOTH breakpoints (only the status column's width differs),
  // so each is defined once and shared by the two column sets. Visual output
  // unchanged: the phone table keeps its 134px status column, sm+ keeps 184px.
  const statusCell = (row: QueueRow) => (
    <div className="flex flex-col items-start gap-1">
      <StatusPill status={row.status} />
      {/* User QA — the prior-rejection flag lives with the status (stacked
          under the stage pill), not crammed under the candidate name;
          PriorRejectionPill compacts to "Rejected ×N" to fit 134px. */}
      <PriorRejectionPill count={row.priorRejections?.count} />
    </div>
  );
  const actionColumn: TableColumn<QueueRow> = {
    key: "actions",
    header: "",
    width: "118px",
    align: "right",
    cell: (row) => {
      const decided = stageForStatus(row.status) === "Shortlisted" || stageForStatus(row.status) === "Rejected";
      const name = fullName(row.applicant);
      return (
        <div className="flex items-center justify-end">
          <button
            type="button"
            className="dlg-cta inline-flex tap-44 min-h-[36px] items-center gap-1 px-4 text-xs focus-ring"
            aria-label={decided ? `View decision for ${name}` : `Review application from ${name}`}
            title={decided ? "View decision" : "Review"}
            onClick={() => setSelectedId(row.id)}
          >
            {decided ? "View" : "Review"}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      );
    },
  };
  const queueColumns: TableColumn<(typeof listRows)[number]>[] = isMobile
    ? [
        {
          key: "applicant",
          header: "Candidate",
          // Declared: see the recruitment note — the block's filler col would
          // otherwise take half the leftover under table-layout:fixed.
          width: "106px",
          cell: (row) => {
            const name = fullName(row.applicant);
            const position = row.job.position?.positionTitle || row.job.title;
            return (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{name}</p>
                <p className="truncate text-xs text-stone">{humanize(position)}</p>
              </div>
            );
          },
        },
        {
          key: "status",
          header: "Status",
          width: "134px",
          cell: statusCell,
        },
        actionColumn,
      ]
    : [
    {
      key: "applicant",
      header: "Candidate",
      cell: (row) => {
        const name = fullName(row.applicant);
        return (
          <div className="flex items-center gap-3">
            <KanbanAvatar name={name} size={32} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{name}</p>
              <p className="truncate text-xs text-stone">{row.applicant.emailAddress || "No email on record"}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: "position",
      header: "Position",
      cell: (row) => {
        const position = row.job.position?.positionTitle || row.job.title;
        // Task 24 — Place of assignment retired; the subtitle line speaks the
        // posting's division full name when one is set.
        const place = row.job.position?.division ? divisionFullName(row.job.position.division) : null;
        return (
          <div className="min-w-0">
            <p className="truncate text-[13px] text-ink">{humanize(position)}</p>
            {place && <p className="truncate text-xs text-stone">{place}</p>}
          </div>
        );
      },
    },
    {
      key: "dateApplied",
      header: "Applied",
      width: "110px",
      cell: (row) => <span className="num whitespace-nowrap text-[13px] text-stone">{formatDate(row.dateApplied)}</span>,
    },
    {
      key: "status",
      header: "Status",
      // 184px — fits the full "Previously rejected ×N" pill (148px measured)
      // stacked under the stage pill (user QA: the flag moved out of the
      // Candidate cell into Status).
      width: "184px",
      cell: statusCell,
    },
    {
      key: "verdict",
      header: "Verdict",
      width: "120px",
      cell: (row) => <VerdictPill verdict={row.match?.verdict} />,
    },
    // The single Review/View capsule (36px + cell padding) — the profile
    // icon button that shared this cell is retired (2026-10).
    actionColumn,
  ];
  const rejectedIds = useMemo(
    () => applications.filter((r) => stageForStatus(r.status) === "Rejected").map((r) => r.id),
    [applications]
  );

  const kanbanColumns = useMemo(() => bucketByStage(applications), [applications]);

  const sendRegrets = async () => {
    setRegretBusy(true);
    try {
      const res = await apiFetch<{ summary: RegretSummary }>("/api/evaluator/applications/regrets", {
        method: "POST",
        body: { applicationIds: rejectedIds },
      });
      const s = res.summary;
      const parts = [
        `${s.sent} sent`,
        `${s.alreadySent} already sent`,
        s.shortlisted ? `${s.shortlisted} shortlisted skipped` : "",
        s.failed ? `${s.failed} failed` : "",
        s.notFound ? `${s.notFound} not found` : "",
      ].filter(Boolean);
      if (s.sent > 0) {
        toast.success(`Regret letters: ${s.sent} sent`, { description: parts.join(" · ") });
      } else {
        toast.info("No new regret letters sent", { description: parts.join(" · ") });
      }
      setRegretOpen(false);
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send regret letters");
    } finally {
      setRegretBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Enterprise page header (PageHeader) — shared anatomy across all views */}
      <PageHeader
        title="Review Queue"
        description="Screen applications, verify minimum qualifications, and advance candidates through the pipeline."
        actions={
          <>
            <StatusPill
              status={`${applications.length} application${applications.length === 1 ? "" : "s"}`}
              variant="neutral"
              className="num"
            />
            <SegmentedControl
              ariaLabel="Queue view mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "kanban", label: "Kanban", icon: LayoutGrid },
                { value: "list", label: "List", icon: List },
              ]}
            />
            <RefreshButton onRefresh={() => load(true)} />
          </>
        }
      />
      {/* QA 2026-02: scope of administrator access to Review */}
      {isAdmin && (
        <NoteBanner label="Administrator access">
          you can view and assist with every evaluation in this queue. Scoring decisions and
          recommendations remain the responsibility of the assigned evaluators.
        </NoteBanner>
      )}

      {/* Stage tabs (list mode only) */}
      {mode === "list" && (
        <div className="flex flex-wrap items-center gap-2">
          {(["All", ...PIPELINE_STAGES] as const).map((s) => {
            const count = s === "All" ? applications.length : applications.filter((r) => stageForStatus(r.status) === s).length;
            const active = listStage === s;
            return (
              <FilterChip key={s} active={active} onClick={() => setListStage(s)} count={count}>
                {s !== "All" && <StageDot stage={s} />}
                {s}
              </FilterChip>
            );
          })}
          {listStage === "Rejected" && rejectedIds.length > 0 && (
            <button type="button" className={ghostBadBtn} onClick={() => setRegretOpen(true)}>
              <MailX className="h-4 w-4" aria-hidden />
              Send regret letters ({rejectedIds.length})
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && <ErrorCard title="Couldn't load the review queue" description={error} onRetry={() => void load()} />}

      {/* Loading skeleton */}
      {!error && queue === null && (
        <>
          {mode === "kanban" ? <SkeletonKanban columns={4} /> : <SkeletonRows rows={8} rowClassName="h-16" />}
        </>
      )}

      {/* Kanban — reference board: tinted columns, floating cards, "N more" expanders */}
      {!error && queue !== null && mode === "kanban" && (
        <div className={KANBAN_BOARD_CLASS}>
          {PIPELINE_STAGES.map((stage) => {
            const rows = kanbanColumns[stage];
            return (
              <KanbanColumn key={stage} label={stage} stage={stage} count={rows.length}>
                {rows.map((row) => {
                    const position = row.job.position?.positionTitle || row.job.title;
                    const name = fullName(row.applicant);
                    return (
                    /* Card container is a div with button semantics — a real
                       <button> here would invite nesting interactive content
                       and break HTML validity/hydration. Enter AND Space are
                       handled for keyboard parity. The whole card opens the
                       review workspace (the retired profile icon that used to
                       surface on hover left with its group/card coupling). */
                    <div
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      className={KANBAN_CARD + " focus-ring cursor-pointer p-4 text-left"}
                      onClick={() => setSelectedId(row.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(row.id);
                        }
                      }}
                      aria-label={`Review application from ${name}`}
                    >
                      <KanbanCardBody
                        name={name}
                        position={humanize(position)}
                        appliedLabel={`Applied ${appliedAgo(row.dateApplied)}`}
                        match={{ metCount: row.match?.metCount ?? 0, requiredCount: row.match?.requiredCount ?? 0 }}
                        tags={[...(row.tags ?? [])]}
                        statusFlag={
                          // User QA — the prior-rejection badge is a STATUS
                          // now: it renders on its own line immediately
                          // BEFORE the match-percentage badge instead of
                          // trailing as a credential tag.
                          // Task 56 — the flag element used to be passed
                          // UNCONDITIONALLY, so KanbanCardBody always took
                          // the flag branch and healthy cards (no prior
                          // rejection) dropped their match percentage onto
                          // its own line — stretching every card. Gate the
                          // slot on an actual count: with no flag the badge
                          // returns to the name row's right edge (the name
                          // is min-w-0 + truncate and the badge is shrink-0,
                          // so long names ellipsize instead of pushing or
                          // overlapping it); flagged cards keep the
                          // approved flag-line layout.
                          row.priorRejections?.count && row.priorRejections.count > 0 ? (
                            <PriorRejectionPill count={row.priorRejections.count} />
                          ) : undefined
                        }
                      />
                    </div>
                  );
                  })}
              </KanbanColumn>
            );
          })}
        </div>
      )}

      {/* List */}
      {!error && queue !== null && mode === "list" && (
        <div className="space-y-3">
          {listRows.length === 0 ? (
            <div className="dlg-card p-6 sm:p-10">
              <EmptyState
                icon={Inbox}
                title="No applications in the queue"
                description={listStage === "All" ? "Applications appear here once candidates apply." : `No applications in the ${listStage} stage yet.`}
              />
            </div>
          ) : (
            <div className="dlg-card table-card overflow-hidden">
              {/* In-card header band — same anatomy as the recruitment table */}
              <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
                <IconChip icon={UserRound} tone="slate" size={36} iconSize={16} />
                <h2 className="text-base font-medium text-ink">Applications</h2>
                <span className="dlg-pill num ml-auto bg-fog px-2.5 py-1 text-xs font-medium text-stone">
                  {listRows.length} in view
                </span>
              </div>
              {/* BEUI Phase 5 — official virtualized Table; the header band
                  above and stage tabs remain the unchanged RMIS anatomy */}
              <Table
                data={listRows}
                columns={queueColumns}
                getRowId={(row) => String(row.id)}
                rowHeight={ROW_H}
                height={(listRows.length + 1) * ROW_H}
                className={cn(
              "rounded-none border-0 [&_table]:w-full",
              // Task 39 (mobile): the block's td/th wear px-4; below sm that
              // steals 8px per cell from the tight 3-column budget — px-3
              // keeps the declared widths ellipsis-free on phones.
              "max-sm:[&_td]:px-3 max-sm:[&_th]:px-3"
            )}
              />
            </div>
          )}
        </div>
      )}

      {/* Review modal — much wider surface (1440px cap) so the dossier and
          decision rail breathe; bounded dossier sections scroll internally. */}
      <Dialog open={selectedId !== null} onOpenChange={(v) => !v && setSelectedId(null)}>
        <DialogContent className={cn(dialogScroll, "rounded-3xl border border-border bg-white", "w-[min(96vw,1440px)] sm:max-w-[1440px]")} ariaLabel="Review application">
          <DialogHeader className="sr-only">
            <DialogTitle className="text-xl font-medium text-foreground">Review application</DialogTitle>
            <DialogDescription>Applicant dossier and decision rail</DialogDescription>
          </DialogHeader>
          {selectedId !== null && (
            <ReviewWorkspace
              applicationId={selectedId}
              bounded
              onClose={() => setSelectedId(null)}
              onDecided={() => void load(true)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk regret confirm */}
      <AlertDialog open={regretOpen} onOpenChange={setRegretOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send {rejectedIds.length} regret letter{rejectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Formal regret emails will be sent to every rejected-stage application currently filtered. Shortlisted
              applications are hard-skipped, and applicants who already received a letter are not emailed again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(ghostBadModifier, "min-h-[44px] px-4 text-sm font-medium")}
              onClick={(e) => {
                e.preventDefault();
                void sendRegrets();
              }}
            >
              {regretBusy ? "Sending…" : "Send letters"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
