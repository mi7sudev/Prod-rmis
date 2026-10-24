"use client";

// ============================================================================
// RMIS — Application detail modal (spec §7.7). Extracted verbatim from
// applicant-home.tsx (architecture candidate ⑥). Stage → label/hue/behavior
// comes from the journey vocabulary module (applicant/journey-vocabulary),
// which re-uses lib/status + lib/status-ui.
// ============================================================================

import { useEffect, useState, type ComponentType } from "react";
import { toast } from "@/lib/toast";
import {
  BadgeCheck,
  Briefcase,
  CalendarClock,
  Clock,
  Coins,
  FileText,
  Users,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { ghostBadBtn, cancelBtn } from "@/components/ui/buttons";
import { StatusPill } from "@/components/ui/shell";
import { Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle } from "@/components/motion/alert";
import { apiFetch, deadlineState, formatCurrency, formatDate, humanize } from "@/lib/client";
import type { ApplicationWire } from "@/lib/router";
import { isActiveApplicationStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { MQR_MEETS, type MqrResult } from "@/lib/mqr.shared";
import { divisionFullName } from "@/lib/constants";
import { DetailTabs, INK_CTA, sgLabel } from "@/components/views/jobs/posting-detail-tabs";
import {
  journeyCancellable,
  journeyProgress,
  stageVariant,
} from "@/components/views/applicant/journey-vocabulary";

// Task 39 — the modal mirrors the job posting DETAIL PAGE's anatomy (user
// directive: the old vitals-grid + MQR-ledger + RichSection stack no longer
// matched "the job detail ui ux layout that we have when applying"). It now
// speaks the page's exact anatomy: the typographic header (bold title + the
// "DOST-MIRDC · division · section" attribution line), the SAME shared
// DetailTabs section (Description | Requirements — extracted verbatim to
// views/jobs/posting-detail-tabs.tsx so the page and this modal can never
// drift), and a right summary aside carrying the page SummaryCard's row
// anatomy (salary headline → icon rows) with the page-parity action block
// (dark-ink Close CTA over the quiet underlined Cancel Application link
// behind the §7.7 AlertDialog). The application's chips (status pill +
// record #) sit above the title — they have no page equivalent and must stay
// visible on every breakpoint. Below sm the aside stacks beneath the tabs,
// the page's own mobile behavior. The applied strip is status-aware like the
// page's SummaryCard alerts: success while the application is in the
// pipeline, warning once it has not been shortlisted.

export function ApplicationDetailModal({
  application,
  onClose,
  onCancelled,
}: {
  application: ApplicationWire;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const job = application.job ?? null;
  const pos = job?.position ?? null;
  const { label } = journeyProgress(application.status);
  const cancellable = journeyCancellable(label);
  const active = isActiveApplicationStatus(application.status);
  const dl = deadlineState(job?.deadlineDate ?? null);

  // Spec §7.7 — the applicant's own MQR verdict ledger, computed live at open
  // from the SAME engine the apply gate runs (lib/requirements via
  // /api/jobs/verify-mqr). Task 39 kept the page anatomy; the ledger rides in
  // the summary aside so the applicant sees their qualification check beside
  // the position's Requirements tab.
  const [mqr, setMqr] = useState<MqrResult | null>(null);
  const [mqrReady, setMqrReady] = useState(false);
  const jobId = job?.id ?? null;
  useEffect(() => {
    if (jobId == null) return;
    let cancelled = false;
    apiFetch<{ mqrResults: MqrResult }>("/api/jobs/verify-mqr", {
      method: "POST",
      body: { jobId },
    })
      .then((res) => {
        if (!cancelled) {
          setMqr(res.mqrResults);
          setMqrReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setMqrReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const cancelApplication = async () => {
    setCancelling(true);
    try {
      await apiFetch(`/api/applications/${application.id}`, { method: "DELETE" });
      toast.success("Application cancelled", { description: "Your application has been withdrawn." });
      setConfirmOpen(false);
      onClose();
      onCancelled();
    } catch (e) {
      // Progressed applications: surface the server's guidance (e.g. "contact HR") as-is.
      toast.error(e instanceof Error ? e.message : "Unable to cancel this application");
      setConfirmOpen(false);
    } finally {
      setCancelling(false);
    }
  };

  // The page SummaryCard's row anatomy — Item No. / Position Type /
  // Vacancies / Salary Grade / Application Deadline / Posted (Task 39:
  // replaces the modal's old vitals grid; the salary itself moved UP into
  // the page's big num headline slot in the aside).
  const rows: {
    icon: ComponentType<{ className?: string }>;
    value: string;
    caption: string;
    overdue?: boolean;
  }[] = [
    { icon: FileText, value: pos?.itemNumber || "-", caption: "Item No." },
    {
      icon: Briefcase,
      value: job?.positionType
        ? humanize(job.positionType)
        : pos?.positionType
          ? humanize(pos.positionType)
          : "-",
      caption: "Position Type",
    },
    {
      icon: Users,
      value: job?.numberOfVacancy == null ? "-" : String(job.numberOfVacancy),
      caption: "Vacancies",
    },
    { icon: Coins, value: sgLabel(pos?.salaryGrade, pos?.salaryStep), caption: "Salary Grade" },
    {
      icon: CalendarClock,
      value: job?.deadlineDate ? formatDate(job.deadlineDate) : "Open until filled",
      caption: dl.overdue ? "Deadline passed" : "Application Deadline",
      overdue: dl.overdue,
    },
    { icon: Clock, value: formatDate(job?.publishDate ?? job?.publishedAt ?? null), caption: "Posted" },
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="dlg-card-plain max-h-[90dvh] w-full overflow-y-auto scroll-thin p-0 sm:max-w-4xl lg:max-w-6xl" ariaLabel={job?.title ?? "Application"}>
        <div className="p-5 sm:p-8">
          {/* Typographic header — the page's PostingHeader anatomy (bold
              title + employer attribution) with the application's chips row
              on top: status + record number have no page equivalent and stay
              visible on every breakpoint. */}
          <header aria-label="Application header">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={label} variant={stageVariant(label)} />
              <span className="dlg-pill num rounded-full bg-fog px-3 py-1 text-xs font-medium text-stone">
                Application #{application.id}
              </span>
            </div>
            <DialogTitle className="mt-3 font-display text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
              {job ? humanize(job.title) : "Application"}
            </DialogTitle>
            <p className="mt-2 text-[15px] leading-snug text-stone">
              {[
                "DOST-MIRDC",
                pos?.division ? divisionFullName(pos.division) : null,
                pos?.section || null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </header>

          {/* Task 66 — desktop width: the Key Competency tab runs a page long,
              so lg+ widens the dialog (4xl → 6xl) and the summary column
              (300 → 320px) to keep the reading column comfortable. */}
          <div className="mt-5 grid grid-cols-1 items-start gap-6 sm:mt-6 sm:grid-cols-[minmax(0,1fr)_300px] sm:gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* Main column — the status strip + the page's EXACT tab section
                (DetailTabs, shared verbatim with the posting page). */}
            <div className="min-w-0">
              {active ? (
                <Alert variant="success">
                  <AlertIcon>
                    <BadgeCheck />
                  </AlertIcon>
                  <AlertContent>
                    <AlertTitle>Successfully Applied</AlertTitle>
                    <AlertDescription>
                      Applied <span className="num">{formatDate(application.dateApplied)}</span>
                    </AlertDescription>
                  </AlertContent>
                </Alert>
              ) : (
                <Alert variant="warning">
                  <AlertIcon>
                    <Clock />
                  </AlertIcon>
                  <AlertContent>
                    <AlertTitle>Application Not Shortlisted</AlertTitle>
                    <AlertDescription>
                      Applied <span className="num">{formatDate(application.dateApplied)}</span> · You may apply for
                      other open positions.
                    </AlertDescription>
                  </AlertContent>
                </Alert>
              )}
              {job && <DetailTabs job={job} />}
            </div>

            {/* Aside — the page SummaryCard's anatomy (salary headline → icon
                rows) wearing the application's actions; stacks beneath the
                tabs below sm, the page's own mobile behavior. Task 66 —
                lg+ desktop only: the aside is sticky (top aligns with the
                dialog's inner p-8 padding) so the salary/vitals/actions stay
                visible while the long Key Competency tab scrolls; the opaque
                dlg-card-plain background keeps scrolled content from
                bleeding through. */}
            <aside aria-label="Application summary" className="dlg-card-plain border border-border p-5 sm:sticky sm:top-8 sm:p-6">
              <div>
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
                      className={cn(
                        "h-4 w-4 shrink-0",
                        overdue ? "text-[var(--bad)]" : "text-body-gray"
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "num block truncate text-sm font-medium",
                          overdue ? "text-[var(--bad)]" : "text-ink"
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

              {/* Spec §7.7 — the applicant's own MQR verdict ledger (same
                  engine as the apply gate; computed live at modal open). */}
              <div className="mt-5 border-t border-border pt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-body-gray">
                  My qualification check
                </p>
                {!mqrReady ? (
                  <p className="mt-2 text-xs text-body-gray">Checking requirements…</p>
                ) : mqr ? (
                  <ul className="mt-2 space-y-1.5">
                    {(
                      [
                        ["Education", mqr.education],
                        ["Eligibility", mqr.eligibility],
                        ["Work experience", mqr.workExperience],
                        ["Training", mqr.training],
                      ] as const
                    ).map(([labelText, verdict]) => (
                      <li key={labelText} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-body-gray">{labelText}</span>
                        <span
                          className={cn(
                            "font-medium",
                            verdict === MQR_MEETS ? "text-[var(--ok)]" : "text-[var(--bad)]"
                          )}
                        >
                          {verdict === MQR_MEETS ? "Meets" : "Does not meet"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-body-gray">No linked position standards to check.</p>
                )}
              </div>

              {/* Page-parity action block — the dark-ink CTA (Close) over the
                  quiet underlined destructive link (§7.7 confirm below). */}
              <div className="mt-5 border-t border-border pt-5">
                <button type="button" onClick={onClose} className={`${INK_CTA} w-full`}>
                  Close
                </button>
                {cancellable && (
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    disabled={cancelling}
                    className="focus-ring mt-2 min-h-[44px] w-full rounded-xs text-sm font-medium text-body-gray underline-offset-2 hover:text-ink hover:underline disabled:pointer-events-none disabled:opacity-50"
                  >
                    Cancel Application
                  </button>
                )}
              </div>
            </aside>
          </div>
        </div>

        {/* Nested destructive confirm (§7.7) */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent className="dlg-card-plain">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display text-2xl text-ink">Cancel this application?</AlertDialogTitle>
              <AlertDialogDescription className="text-sm leading-relaxed text-body-gray">
                Your application for {job?.title ?? "this position"} will be withdrawn. You may apply again while the
                position is still open. Once review has started, applications can no longer be cancelled.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={cancelBtn}>Keep it</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void cancelApplication();
                }}
                disabled={cancelling}
                className={`${ghostBadBtn} px-5 py-2.5`}
              >
                {cancelling ? "Cancelling…" : "Cancel Application"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
