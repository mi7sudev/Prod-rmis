"use client";

// ============================================================================
// RMIS — Profile builder · Section 07 Supporting Documents (spec §7.4, §10).
// Storage-only by design (no extraction here). Uploads land in the default
// SUPPORTING category (server default — no category picker in the UI).
// Rows are the reui c-file-type-7 pattern (shadcn registry @reui — used
// exactly per its docs, not recreated): an ItemGroup list of outline Items,
// each with the FileType extension tile in ItemMedia (restored per user
// direction, Task 27) and name / category /
// size / date in ItemContent (+ status pill for extractable categories,
// extraction error via tooltip) with single and checkbox batch delete.
// Rows are clickable: the file name (or the eye button) opens a preview
// modal — PDFs render inline in an iframe, images in an <img>, Word/Excel
// fall back to a download card. Checkbox and delete stay independent.
// Upload surface: the OFFICIAL UploadCN FolderUpload block (shadcn registry
// @uploadcn/folder-upload — used exactly per its docs, not recreated):
// a folder that opens on hover/drag, files fly in, and its front panel shows
// live progress. Transport lives in a createAdapter adapter (the official
// extension point): one POST per file to /api/applicant/documents with TRUE
// byte progress via the client layer's apiUpload seam (lib/client — the ONE
// owner of transport + { error } envelope + verbatim 401/403/413/415/500
// fallbacks), same FormData file+category contract. Client
// validation mirrors the server rules (extension allowlist → reject, 10 MB
// cap → reject) so bad files fail before a byte is sent. Uploads run one at
// a time (concurrency 1, SQLite-safe). Edit mode is a two-column workspace —
// uploaded files list on the LEFT, the upload folder on the RIGHT (stacked,
// folder first, on phones).
// Task 41 — READ-ONLY PREVIEW BY DEFAULT (user request, extended to every
// section): with files on record the section opens as a quiet preview — the
// upload folder, checkboxes and delete buttons are hidden; rows stay
// clickable (and the eye button stays) because OPENING a document is a read
// action. "Edit Profile" reveals the two-column workspace; "Done Editing"
// returns to the preview. An EMPTY record boots straight into edit mode
// (there is nothing to preview yet, mirroring section 01's new-record boot).
// Mutations are immediate, so no draft/unsaved guard applies here.
// ============================================================================

import { useMemo, useRef, useState } from "react";
import { createAdapter } from "@uploadcn/core";
import { useUploader } from "@uploadcn/react";
import { toast } from "@/lib/toast";
import { announceSectionSaved } from "./section-mutations";
import { Eye, Paperclip, Pencil, Trash2 } from "lucide-react";
import { DocumentsIcon } from "@/components/icons/section-icons";
import { FileType, getFileType } from "@/components/reui/file-type";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import { DocumentPreviewModal, documentStatusChip } from "@/components/ui/document-preview";
import { FolderUpload } from "@/components/folder-upload";
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
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, SectionCard, StatusPill } from "@/components/ui/shell";
import { ghostBadBtn, iconBtnBad, cancelBtn, sectionCtaBtn } from "@/components/ui/buttons";
import { SectionEditActions } from "./section-edit-actions";
import { Tooltip, TooltipProvider } from "@/components/motion/tooltip";
import { apiFetch, apiUpload, formatDate, humanize } from "@/lib/client";
import { UPLOAD_ACCEPT } from "@/lib/validation";
import type { DocumentWire } from "@/lib/router";

/** Client-side mirror of the server contract (route.ts): the accept string
    derives from the ONE shared allowlist (lib/validation UPLOAD_EXTENSIONS —
    the server imports the same list for its 415 backstop) + the 10 MB cap.
    Bad files are rejected before a byte is sent. */
const DOCUMENT_ACCEPT = UPLOAD_ACCEPT;
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB (spec §10 → server 413)

export default function DocumentsSection({
  docs,
  onChanged,
}: {
  docs: DocumentWire[];
  onChanged: () => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTargets, setDeleteTargets] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<DocumentWire | null>(null);
  // Task 41 — section-level edit gate: an empty record boots in edit mode
  // (the upload folder IS the add path), a populated record boots as preview.
  const [editMode, setEditMode] = useState(() => docs.length === 0);

  const openPreview = (doc: DocumentWire) => setPreview(doc);

  // Cross-batch counters for the refresh gate in onComplete below.
  const uploadedCountRef = useRef(0);
  const settledCountRef = useRef(0);

  // The RMIS documents adapter — the OFFICIAL createAdapter extension point.
  // One sequential POST per file (concurrency 1 below, SQLite-safe) with
  // TRUE XHR byte progress via the client layer's apiUpload seam (lib/client
  // owns transport, envelope parsing and the verbatim error fallbacks);
  // files land in the default SUPPORTING category.
  const documentsAdapter = useMemo(
    () =>
      createAdapter<DocumentWire>(async ({ file, signal, onProgress }) => {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", "SUPPORTING");
        return await apiUpload<DocumentWire>("/api/applicant/documents", fd, {
          onProgress,
          signal,
        });
      }),
    [],
  );

  // The official useUploader engine, wired per the UploadCN docs. Server
  // rules mirrored client-side (accept + maxSize → rejected before upload);
  // duplicates allowed (a re-exported file may repeat); no auto-retry —
  // failures surface verbatim and the user retries deliberately.
  const uploader = useUploader<DocumentWire>({
    adapter: documentsAdapter,
    accept: DOCUMENT_ACCEPT,
    maxSize: MAX_UPLOAD_SIZE,
    concurrency: 1,
    duplicates: "allow",
    retry: false,
    onSuccess: (item) => {
      uploadedCountRef.current += 1;
      toast.success(`${item.file.name} uploaded`);
    },
    onError: (_item, error) => toast.error(error.message),
    onReject: (item) =>
      toast.error(
        item.issues[0]?.message ?? `${item.file.name} was not accepted`,
      ),
    onComplete: async () => {
      // Queue drained — refresh the table below only when the settled-OK
      // count grew (retries and failed runs stay quiet).
      if (uploadedCountRef.current > settledCountRef.current) {
        settledCountRef.current = uploadedCountRef.current;
        await onChanged();
      }
    },
  });

  const runDelete = async (ids: string[]) => {
    setDeleting(true);
    let okCount = 0;
    for (const id of ids) {
      try {
        await apiFetch(`/api/applicant/documents/${id}`, { method: "DELETE" });
        okCount += 1;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "A document could not be deleted");
      }
    }
    setDeleting(false);
    setDeleteTargets(null);
    setSelected(new Set());
    if (okCount > 0) {
      toast.success(okCount === 1 ? "Document deleted" : `${okCount} documents deleted`);
      await onChanged();
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // The uploaded-files list — shared by the two-column edit workspace and
  // the full-width read-only preview (Task 41 gate controls checkbox/delete).
  const filesList =
    docs.length === 0 ? (
      <EmptyState compact icon={Paperclip} tone="slate" title="No documents on file yet" description="Upload credentials HR will need for verification." />
    ) : (
      <TooltipProvider delay={150}>
        {/* No inner max-height below lg: the section column is already a
            bounded scroller — a nested scroll pane traps touch gestures
            on phones. The cap returns on lg where the column is roomy. */}
        <div className="overflow-y-auto scroll-thin pr-1 lg:max-h-96">
          {/* reui c-file-type-7 pattern — ItemGroup is a role="list", so
              each row declares itself a listitem or assistive tech announces
              an empty list. */}
          <ItemGroup aria-label="Supporting documents" className="gap-2">
            {docs.map((doc) => {
              const chip = documentStatusChip(doc);
              return (
                <Item
                  key={doc.id}
                  role="listitem"
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-border bg-white/80 transition-colors hover:bg-card hover:shadow-[0_1px_6px_rgba(14,28,38,0.06)]"
                >
                  {/* Task 41: the checkbox renders only in edit mode. */}
                  {editMode && (
                    <Checkbox
                      checked={selected.has(doc.id)}
                      onCheckedChange={() => toggle(doc.id)}
                      aria-label={`Select ${doc.originalName}`}
                      className="shrink-0"
                    />
                  )}
                  {/* Task 27 (user direction) — the reui FileType extension
                      tile is BACK as each row's media anchor (the official
                      c-file-type-7 pattern's ItemMedia slot), rendered in its
                      "light" page variant per the pattern docs. Task 23's
                      icon-free rule keeps applying to the OTHER tables — the
                      documents rows are the file-list pattern and carry the
                      type tile; the functional eye "View" action stays. */}
                  <ItemMedia>
                    <FileType
                      type={getFileType(doc.originalName)}
                      variant="light"
                      aria-hidden="true"
                    />
                  </ItemMedia>
                  {/* Clickable view target: the file name opens the preview
                      modal. min-w-0 lets the content shrink below the name's
                      width, and the button (not the flex title) carries the
                      ellipsis. */}
                  <ItemContent className="min-w-0">
                    <ItemTitle className="max-w-full">
                      <button
                        type="button"
                        onClick={() => openPreview(doc)}
                        className="focus-ring min-w-0 cursor-pointer truncate rounded-sm text-left text-ink transition-colors hover:text-primary"
                        title={doc.originalName}
                        aria-label={`View ${doc.originalName}`}
                      >
                        {doc.originalName}
                      </button>
                    </ItemTitle>
                    {/* The inner block span owns truncation: the pattern's
                        <p> is a line-clamp box, and one nowrap line inside it
                        ellipsizes cleanly in the narrow edit column. */}
                    <ItemDescription>
                      <span className="block truncate">
                        {humanize(doc.category)}
                        <span
                          aria-hidden="true"
                          className="bg-muted-foreground/40 mx-1.5 inline-block size-1 rounded-full align-middle"
                        />
                        <span className="num">{Math.max(1, Math.round(doc.size / 1024))} KB</span>
                        <span
                          aria-hidden="true"
                          className="bg-muted-foreground/40 mx-1.5 inline-block size-1 rounded-full align-middle"
                        />
                        <time dateTime={doc.createdAt}>{formatDate(doc.createdAt)}</time>
                      </span>
                    </ItemDescription>
                  </ItemContent>
                  {chip && (
                    <Tooltip content={doc.extractionError} arrow>
                      <span className="inline-flex shrink-0 cursor-default">
                        <StatusPill status={chip.label} variant={chip.variant} pulse={chip.pulse} className="shrink-0 cursor-default" />
                      </span>
                    </Tooltip>
                  )}
                  <ItemActions>
                    {/* Eye button: white hover on the white rows. Viewing a
                        document is a READ action — it stays in the preview. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openPreview(doc)}
                      aria-label={`View ${doc.originalName}`}
                      className="text-stone hover:bg-cloud/70 hover:text-ink"
                    >
                      <Eye aria-hidden="true" />
                    </Button>
                    {/* Task 41 — delete lives behind the edit gate. */}
                    {editMode && (
                      <button
                        type="button"
                        onClick={() => setDeleteTargets([doc.id])}
                        aria-label={`Delete ${doc.originalName}`}
                        className={iconBtnBad}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        </div>
      </TooltipProvider>
    );

  return (
    <SectionCard
      variant="plain"
      bareOnMobile
      iconArt={<DocumentsIcon className="size-9" />}
      title="Supporting Documents"
      description={
        editMode
          ? "Editing — uploads and removals apply immediately."
          : "Read-only preview — click Edit Profile to make changes."
      }
      /* User QA 2026-10-21: BOTH header controls — "Edit Profile" AND "Done
         Editing" — stay top-right beside the
         heading on phones in both states (same anatomy as sm+) — the Done
         Editing pill occupies the exact Edit Profile slot. */
      actionsInlineOnMobile
      actions={
        editMode ? (
          <SectionEditActions
            onCancel={() => setEditMode(false)}
            onDone={() => {
              setEditMode(false);
              announceSectionSaved("Supporting Documents");
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditMode(true)}
            className={sectionCtaBtn}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" /> Edit Profile
          </button>
        )
      }
    >
      {editMode ? (
        /* Two-column edit workspace — uploaded files list on the LEFT,
           the official FolderUpload folder on the RIGHT. On phones it
           stacks folder-first (the primary action) with the list below. */
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Upload folder — the official UploadCN block, wired per its
              docs (<FolderUpload uploader={…} name={…} />): a folder that
              opens on hover/drag, files fly in, the front shows live
              progress. Transport lives in the createAdapter adapter above. */}
          <div className="order-1 rounded-3xl border border-border bg-cloud/60 p-4 lg:order-2">
            <FolderUpload
              uploader={uploader}
              name="Supporting Documents"
              title="Drop files into Supporting Documents"
              description="Files upload one at a time · max 10 MB each"
            />
          </div>

          {/* Uploaded files list — left column on desktop. */}
          <div className="order-2 min-w-0 lg:order-1">
            {/* Batch action bar (Task 41: edit-session only) */}
            {selected.size > 0 && (
              <div className="mb-3 flex items-center justify-between rounded-lg bg-cloud/60 px-4 py-2">
                <span className="num text-xs text-stone">{selected.size} selected</span>
                <button
                  type="button"
                  onClick={() => setDeleteTargets([...selected])}
                  disabled={deleting}
                  className="focus-ring inline-flex min-h-[44px] items-center gap-2 px-4 text-sm font-medium text-[var(--bad)] disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" /> Delete selected
                </button>
              </div>
            )}
            {filesList}
          </div>
        </div>
      ) : (
        /* Read-only preview — the list alone, full width (Task 41). */
        <div className="mt-4">
          {filesList}
        </div>
      )}

      <AlertDialog open={deleteTargets !== null} onOpenChange={(o) => !o && setDeleteTargets(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-ink">
              {deleteTargets !== null && deleteTargets.length > 1 ? `Delete ${deleteTargets.length} documents?` : "Delete this document?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-body-gray">
              The file will be permanently removed from your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtn}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteTargets) void runDelete(deleteTargets);
              }}
              disabled={deleting}
              className={`${ghostBadBtn} px-5 py-2.5`}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Document preview modal — click a row to view it here (shared component) */}
      <DocumentPreviewModal
        doc={preview}
        open={preview !== null}
        onOpenChange={(o) => {
          if (!o) setPreview(null);
        }}
      />
    </SectionCard>
  );
}
