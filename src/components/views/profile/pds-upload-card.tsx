"use client";

// ============================================================================
// RMIS — PDS upload & auto-extraction (spec §7.5, §8.4), rendered as the
// OPTIONAL "Auto-fill from PDS" row at the FOOT of the profile page
// (credentials-first: manual form filling is the primary path; this is a
// shortcut for applicants who already have a filled CS Form 212).
// Collapsed by default (the resting look); expanding reveals the pipeline:
// upload (category PDS) → extract → auto-apply, with Uploading → Extracting
// → Applying phase progress. ONE-EXTRACTION LOCK: once any extractable
// document is EXTRACTED/PARTIALLY_EXTRACTED the dropzone is replaced by a
// locked strip whose only way back is "Clear Forms & Re-upload" → confirm →
// POST /api/applicant/profile/clear (files stay). Extraction errors show the
// server message + file name + Try Again. Upload surface: the OFFICIAL BEUI
// FileUpload block (variant="centered") — single-slot queue (a fresh pick
// replaces the attempt), old stage progress (20/55/75/90/100) mapped onto
// the block's own progressbar, extract/apply phase label kept as glue above
// the block (those phases are inexpressible via block props). Bevel pass:
// WHITE collapsible card (sits on the record panel's cloud tint), capsule
// destructive actions. Presentation-only changes.
// Task 54 design pass (STILL presentation-only — zero behavior/feature
// change): trigger row gained a focus ring, roomier sm padding and a
// wrapping (non-truncating) mobile description; the expanded panel gained a
// quiet numbered "how it works" strip (the three phases as caption, hidden
// while busy/locked), a centered max-w-2xl dropzone with a fog tint and the
// Browse affordance upgraded to the dlg-cta primary (via the block's new
// additive browseClassName slot); lock/extraction panels share the
// rounded-2xl radius and the lock chip went emerald (success semantics).
// Task 55 — the upload surface is now the SAME BLUE FOLDER as Supporting
// Documents (the official UploadCN FolderUpload block) at its new small
// size (size="sm", ~2/3 scale), wrapped in the section's cloud panel. The
// BEUI FileUpload queue rows are gone: the folder's own front panel carries
// real byte progress (apiUpload onProgress), files fly in, and the pipeline
// (upload → extract → auto-apply) runs inside the uploadcn adapter so the
// phase glue label + one-extraction lock + Try Again alert all keep working.
// Still zero feature change: same single-slot replace (uploader maxFiles 1
// removes the previous attempt first), same 10 MB cap, same accept list.
// Task 81-e — the pipeline's wire contract moved to lib/pds-pipeline.ts (the
// ONE shared contract module): request/response types, the 3-step run
// (runPdsPipeline) and the one-extraction lock predicate (isPdsExtractionLocked).
// The card keeps only UI state wiring — same endpoints, same phases, same
// error copy, same lock, zero behavior change.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { ChevronRight, CloudUpload, Loader2, Lock, RefreshCcw } from "lucide-react";
import { createAdapter } from "@uploadcn/core";
import { useUploader } from "@uploadcn/react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleIndicator,
  CollapsibleTrigger,
} from "@/components/motion/collapsible";
import { FolderUpload } from "@/components/folder-upload";
import { ghostBadBtn, cancelBtn } from "@/components/ui/buttons";
import { IconChip } from "@/components/ui/shell";
import { Alert, AlertAction, AlertContent, AlertDescription, AlertIcon } from "@/components/motion/alert";
import { apiFetch } from "@/lib/client";
import {
  isPdsExtractionLocked,
  runPdsPipeline,
  PDS_UPLOAD_ACCEPT,
  PDS_UPLOAD_MAX_SIZE,
  type PdsAutoApplyResponse,
  type PdsExtractionQuality,
  type PdsPipelinePhase,
} from "@/lib/pds-pipeline";
import type { DocumentWire } from "@/lib/router";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/session-provider";

// Task 81-e — the request/response types, the upload accept/size mirrors, the
// one-extraction lock and the 3-step runner all come from the PDS intake
// pipeline contract (lib/pds-pipeline.ts); only the "idle" resting phase is
// this card's own UI state.
type Phase = "idle" | PdsPipelinePhase;

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  uploading: "Uploading your PDS…",
  extracting: "Extracting from your PDS…",
  applying: "Applying to your profile…",
};

// Task 54 — the caption strip above the dropzone: the same three phases the
// pipeline actually runs (upload → extract → apply), as quiet numbered steps.
const PIPELINE_HINTS = ["Upload your PDS", "We extract the details", "Your forms fill in"];

export default function PdsUploadCard({
  docs,
  onProfileReplaced,
  onDocsChanged,
}: {
  docs: DocumentWire[];
  /** Called after auto-apply / clear — reloads profile + docs and re-seeds forms. */
  onProfileReplaced: () => void | Promise<void>;
  /** Called when document statuses changed without touching the profile. */
  onDocsChanged: () => void | Promise<void>;
}) {
  const { refresh } = useSession();
  const [open, setOpen] = useState(false);
  // Task 61 — after a SUCCESSFUL extraction the row auto-collapses after 3
  // seconds instead of hanging open: the applicant has seen the "Extraction
  // applied" summary + toast, and the row can be re-opened anytime (the
  // locked strip and the extraction summary live in state, not in this
  // timer). Any manual toggle cancels the pending close; error paths never
  // schedule one (the Try-Again alert must stay visible).
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelAutoClose = () => {
    if (autoCloseRef.current !== null) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
  };
  useEffect(() => cancelAutoClose, []);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<{ message: string; fileName: string } | null>(null);
  // Last non-null error — keeps the BEUI alert's exit animation populated with
  // content while the error state has already cleared.
  const [lastError, setLastError] = useState<{ message: string; fileName: string } | null>(null);
  useEffect(() => {
    if (error !== null) setLastError(error);
  }, [error]);
  const [lastApply, setLastApply] = useState<PdsAutoApplyResponse | null>(null);
  const [quality, setQuality] = useState<PdsExtractionQuality | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  // The failing uploader item id — powers the Alert's Try Again.
  const [failingId, setFailingId] = useState<string | null>(null);

  const locked = useMemo(() => isPdsExtractionLocked(docs), [docs]);
  const busy = phase !== "idle";

  /** Quiet .num rows describing what the last auto-apply filled, per section. */
  const applyRows = useMemo(() => {
    if (!lastApply) return [];
    const rows: [string, number][] = [
      ["Personal details", lastApply.applied.personal],
      ["Education entries", lastApply.applied.education],
      ["Work experience entries", lastApply.applied.work],
      ["Training entries", lastApply.applied.training],
      ["Eligibility entries", lastApply.applied.eligibility],
      ["Awards", lastApply.applied.awards],
      ["Existing personal values replaced", lastApply.replaced.personal],
    ];
    return rows.filter(([, n]) => n > 0);
  }, [lastApply]);

  // ── Task 55 — the pipeline INSIDE the UploadCN adapter ─────────────────
  // The whole run (upload → extract → auto-apply) is one adapter call, so
  // the uploader's item stays "uploading" for the entire run: the folder's
  // front panel carries real byte progress for phase 1 (apiUpload onProgress),
  // the phase glue label above covers extract/apply, and the dropzone
  // disables itself while the slot is held. Same phases, same endpoints,
  // same §8.4 semantics as the previous hand-rolled runPipeline.
  const pdsAdapter = useMemo(
    () =>
      createAdapter<PdsAutoApplyResponse>(async ({ file, onProgress }) => {
        setError(null);
        setLastApply(null);
        setQuality(null);

        // Task 81-e — the 3-step run (upload → extract → auto-apply) lives in
        // the contract module; this adapter only wires pipeline events to the
        // card's state, exactly as the inline version did (quality renders
        // from the merged extraction before the apply call runs).
        const outcome = await runPdsPipeline(file, {
          onProgress,
          onPhase: setPhase,
          onExtracted: (ext) => setQuality(ext.merged?.quality ?? null),
        });
        return outcome.applied;
      }),
    [],
  );

  // The official useUploader engine: single slot (maxFiles 1 — the UploadCN
  // root removes the previous attempt before adding a fresh pick, the exact
  // replace semantics the old queue had), no auto-retry, client-side
  // accept + 10 MB mirror of the server rules.
  const uploader = useUploader<PdsAutoApplyResponse>({
    adapter: pdsAdapter,
    accept: PDS_UPLOAD_ACCEPT,
    maxSize: PDS_UPLOAD_MAX_SIZE,
    maxFiles: 1,
    concurrency: 1,
    retry: false,
    onSuccess: async (item) => {
      setPhase("idle");
      const applied = item.result;
      if (!applied) return;
      toast.success(`${applied.totalFilled} fields updated`, {
        description:
          applied.totalReplaced > 0
            ? `${applied.totalReplaced} existing value${applied.totalReplaced === 1 ? " was" : "s were"} replaced. Review each section before applying.`
            : "Review each section before applying.",
      });
      setLastApply(applied);
      await onProfileReplaced();
      await refresh();
      // Task 61 — the result has landed (toast up, panels refreshed): give
      // the applicant 3 seconds with the summary, then collapse the row.
      cancelAutoClose();
      autoCloseRef.current = setTimeout(() => {
        autoCloseRef.current = null;
        setOpen(false);
      }, 3000);
    },
    onError: (item, err) => {
      setPhase("idle");
      setFailingId(item.id);
      setError({
        message: err.message || "Something went wrong while processing your PDS.",
        fileName: item.file.name,
      });
      void onDocsChanged();
    },
    onReject: (item) =>
      toast.error(item.issues[0]?.message ?? `${item.file.name} was not accepted`),
  });

  const clearProfile = async () => {
    setClearing(true);
    try {
      await apiFetch("/api/applicant/profile/clear", { method: "POST" });
      toast.success("Profile cleared", {
        description: "Your forms are empty again. Upload your PDS to auto-fill them.",
      });
      setClearOpen(false);
      setLastApply(null);
      setQuality(null);
      setFailingId(null);
      uploader.remove(); // post-clear folder starts empty (old input reset)
      await onProfileReplaced();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to clear your profile");
    } finally {
      setClearing(false);
    }
  };

  /** Alert Try Again — re-runs the SAME file through the pipeline via the
      uploader's manual retry (no auto-retry is configured). */
  const retryFailing = () => {
    if (!failingId) return;
    setError(null);
    setFailingId(null);
    uploader.retry(failingId);
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={(nextOpen) => {
        // Task 61 — a manual toggle always cancels the pending auto-close
        // (re-opening right after extraction must not be yanked shut).
        if (nextOpen) cancelAutoClose();
        setOpen(nextOpen);
      }}
      className="dlg-card-plain overflow-hidden"
      // Task 15 — [data-tour] hook: the profile guided tour spotlights this
      // collapsed row (the optional "Auto-fill from PDS" entry point) on both
      // desktop and mobile — it is always rendered at the foot of the page.
      data-tour="pds-upload"
    >
      {/* Compact resting row — the screenshot look: chip · title · drop hints */}
      <CollapsibleTrigger
        render={
          <button className="focus-ring flex min-h-[44px] w-full items-center gap-3 p-4 text-left transition-colors hover:bg-cloud/60 sm:px-5" />
        }
      >
        <IconChip icon={CloudUpload} tone="plum" size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-1.5">
            <span className="font-display text-base font-medium text-ink">Auto-fill from PDS</span>
            <span className="dlg-pill shrink-0 bg-fog px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-graphite">
              Beta
            </span>
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-stone sm:truncate">
            Already have a filled PDS (.xlsx)? Upload it and we&apos;ll pre-fill your forms — or skip this and fill them manually.
          </span>
        </span>
        <CollapsibleIndicator className="text-stone" />
      </CollapsibleTrigger>

      <CollapsibleContent contentClassName="border-t border-divider p-4 sm:p-5">
        {/* Task 54 — quiet "how it works" caption: the three pipeline phases
            as numbered chips. Pure description of what already runs below;
            hidden while busy or locked so it never competes with live state. */}
        {!busy && !locked && (
          <ol className="mb-4 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1.5">
            {PIPELINE_HINTS.map((label, i) => (
              <li key={label} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="mx-0.5 h-3 w-3 text-pebble" aria-hidden="true" />}
                <span className="num grid size-[18px] place-items-center rounded-full bg-fog text-[10px] font-medium text-graphite">
                  {i + 1}
                </span>
                <span className="text-xs text-stone">{label}</span>
              </li>
            ))}
          </ol>
        )}

        {/* Extract/apply phases are inexpressible via FileUpload props —
            the phase label stays as glue above the block; stage progress
            lives on the block's own progressbar row. */}
        {busy && (
          <p className="mb-4 flex items-center justify-center gap-2 text-xs text-stone">
            <Loader2 className="h-3 w-3 animate-spin" /> {PHASE_LABEL[phase]}
          </p>
        )}

        <Alert variant="destructive" open={!!error} className="mb-4">
          <AlertIcon />
          <AlertContent>
            <AlertDescription>
              <p className="font-medium">{error?.message ?? lastError?.message}</p>
              <p>{error?.fileName ?? lastError?.fileName}</p>
            </AlertDescription>
            {error !== null && (
              <AlertAction>
                <button
                  type="button"
                  onClick={retryFailing}
                  className="dlg-ghost inline-flex min-h-[44px] items-center gap-2 px-5 py-2 text-sm"
                >
                  <RefreshCcw className="h-3.5 w-3.5" /> Try Again
                </button>
              </AlertAction>
            )}
          </AlertContent>
        </Alert>

        {/* Extraction result — quiet rows with tabular counts */}
        {!busy && (applyRows.length > 0 || quality) && (
          <div className="mb-4 rounded-2xl bg-cloud/60 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-stone">Extraction applied to your profile</p>
              {quality && (
                <p className="flex items-center gap-1.5 text-xs text-stone">
                  <span
                    className={cn(
                      "inline-flex h-5 min-w-[2.5rem] items-center justify-center rounded-full px-1.5 text-[11px] font-medium text-white",
                      quality.grade === "A" ? "bg-[var(--ok)]" : quality.grade === "B" ? "bg-metric-blue" : quality.grade === "C" ? "bg-[var(--warn)]" : "bg-[var(--bad)]"
                    )}
                  >
                    {quality.grade} · {quality.score}/100
                  </span>
                  extraction quality
                </p>
              )}
            </div>
            {applyRows.length > 0 && (
              <dl className="mt-2 divide-y divide-divider">
                {applyRows.map(([label, count]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 py-1.5 first:pt-0 last:pb-0">
                    <dt className="text-xs text-stone">{label}</dt>
                    <dd className="num text-xs font-medium text-ink">{count}</dd>
                  </div>
                ))}
              </dl>
            )}
            {quality && quality.needsReview > 0 && (
              <p className="mt-2 rounded-lg bg-[var(--warn-bg)] px-3 py-2 text-xs text-ink">
                {quality.needsReview} value{quality.needsReview === 1 ? " needs" : "s need"} review — low-confidence reads
                {quality.issues?.length ? ` and ${quality.issues.length} checker note${quality.issues.length === 1 ? "" : "s"}` : ""}. Please verify them on your forms below.
              </p>
            )}
            {quality && quality.issues && quality.issues.length > 0 && (
              <ul className="mt-2 space-y-1">
                {quality.issues.slice(0, 3).map((iss, i) => (
                  <li key={i} className="text-[11px] leading-relaxed text-stone">
                    · {iss.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {locked ? (
          /* One-extraction lock (§7.5) — the only way back is a full clear. */
          <div className="flex flex-col gap-3 rounded-2xl bg-cloud/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <IconChip icon={Lock} tone="emerald" size={36} iconSize={16} className="mt-0.5" />
              <div>
                <p className="text-sm font-medium text-ink">Profile auto-filled from your PDS</p>
                <p className="mt-0.5 text-xs text-stone">
                  Extraction already ran on your documents. Clear your forms to start over.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setClearOpen(true)}
              disabled={clearing}
              className={`${ghostBadBtn} w-fit shrink-0 px-5 py-2.5`}
            >
              {clearing ? "Clearing…" : "Clear Forms & Re-upload"}
            </button>
          </div>
        ) : (
          /* Task 55 — the SAME BLUE FOLDER as Supporting Documents, at its
             small size, on the section's cloud panel. Click or drop starts
             the pipeline; the folder front carries real byte progress; the
             glue label above covers extract/apply. */
          <div className="mx-auto w-fit max-w-full rounded-3xl border border-border bg-cloud/60 p-4 sm:p-5">
            <FolderUpload
              size="sm"
              disabled={busy}
              uploader={uploader}
              name="PDS"
              title="Drop your PDS into the folder"
              description="CS Form 212 · Excel (.xlsx) · up to 10 MB"
              className="w-72 max-w-full"
            />
          </div>
        )}
      </CollapsibleContent>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-ink">Clear all forms and re-upload?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-body-gray">
              This erases ALL of your profile information — personal details, education, work experience, training,
              eligibility, and awards — and marks your profile incomplete again. Your uploaded files stay for HR review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtn}>Keep my data</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void clearProfile();
              }}
              disabled={clearing}
              className={`${ghostBadBtn} px-5 py-2.5`}
            >
              {clearing ? "Clearing…" : "Clear Everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
