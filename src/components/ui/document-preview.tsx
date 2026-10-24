"use client";

// ============================================================================
// RMIS — Shared document preview modal.
// One modal implementation used by the applicant profile (Documents section)
// and the evaluator/admin review workspace dossier: PDFs render inline in an
// iframe, images in an <img>, Word/Excel fall back to a download card. The
// header shows file name, category · size · date and the extraction status
// pill; the footer offers "Open in new tab" and "Download".
// Helpers (fileKind / previewKind / fileUrl / documentStatusChip) are
// exported so row lists can reuse the exact same semantics.
// ============================================================================

import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, FileWarning, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconChip, StatusPill } from "@/components/ui/shell";
import { formatDate, humanize } from "@/lib/client";
import { EXTRACTABLE_CATEGORIES } from "@/lib/validation";
import { documentStatusMeta, type StatusVariant } from "@/lib/status-ui";

/** Minimal document shape the modal needs — DocumentWire and the evaluator
    snapshot documents both satisfy it structurally. */
export type PreviewDoc = {
  id?: string;
  originalName: string;
  mimeType: string;
  size: number;
  filePath: string;
  category: string;
  status: string;
  createdAt: string;
};

export type PreviewKind = "pdf" | "image" | "none";

/** File extension → short uppercase label for the slate mini chip (display-only). */
export function fileKind(name: string): string {
  const ext = name.includes(".") ? (name.split(".").pop() ?? "") : "";
  const labels: Record<string, string> = {
    pdf: "PDF",
    xlsx: "XLSX",
    xls: "XLS",
    xlsm: "XLSM",
    doc: "DOC",
    docx: "DOCX",
    png: "IMG",
    jpg: "IMG",
    jpeg: "IMG",
    gif: "IMG",
    webp: "IMG",
  };
  const key = ext.toLowerCase();
  if (labels[key]) return labels[key];
  return ext ? ext.toUpperCase().slice(0, 4) : "FILE";
}

/** How the modal renders a document: inline PDF, inline image, or download fallback. */
export function previewKind(doc: PreviewDoc): PreviewKind {
  const mime = (doc.mimeType || "").toLowerCase();
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  const ext = (doc.originalName.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "").toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext)) return "image";
  return "none";
}

/** Signed file URL — the route strips the leading "upload" segment itself. */
export function fileUrl(doc: PreviewDoc): string {
  return `/api/files/${doc.filePath}`;
}

/** Inline-object URL for a document that the server actually has. null while
    loading; "missing" means the fetch could not deliver renderable bytes —
    a 404 (row exists, bytes gone since the Oct 2026 build-output incident)
    but equally a 5xx, an expired session, or a network blip. One card covers
    all of these on purpose: its copy is transient-friendly ("temporarily
    unavailable — try again"), so no status split is needed, and an error
    body is never fed to the PDF/image viewer. Task 73: the preview ALWAYS
    verifies the file before rendering, so staff see an explicit card
    instead of a blank PDF frame or a broken image. */
export function usePreviewAsset(doc: PreviewDoc | null, open: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !doc) {
      setUrl(null);
      setMissing(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setUrl(null);
    setMissing(false);
    const controller = new AbortController();
    let created: string | null = null;
    (async () => {
      try {
        const res = await fetch(fileUrl(doc), { cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setMissing(true);
          return;
        }
        const blob = await res.blob();
        if (controller.signal.aborted) return;
        created = URL.createObjectURL(blob);
        if (controller.signal.aborted) {
          URL.revokeObjectURL(created);
          return;
        }
        setUrl(created);
      } catch {
        if (!controller.signal.aborted) setMissing(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      if (created) URL.revokeObjectURL(created);
    };
  }, [open, doc]);

  return { url, missing, loading, markMissing: () => setMissing(true) };
}

/** Document extraction status → label + functional variant + pulse (§2
    status system). Delegates to the shared documentStatusMeta vocabulary
    (status-ui) — the ONE mapping behind every document chip in the system.
    Null for categories without extraction (those rows carry no status). */
export function documentStatusChip(doc: PreviewDoc): {
  label: string;
  variant: StatusVariant;
  pulse: boolean;
} | null {
  if (!(EXTRACTABLE_CATEGORIES as readonly string[]).includes(doc.category)) return null;
  return documentStatusMeta(doc.status);
}

export function DocumentPreviewModal({
  doc,
  open,
  onOpenChange,
}: {
  doc: PreviewDoc | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { url, missing, loading, markMissing } = usePreviewAsset(doc, open);

  const missingCard = (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-6 py-10 text-center">
      <IconChip icon={FileWarning} tone="amber" size={48} iconSize={20} />
      <div>
        <p className="text-sm font-medium text-ink">File temporarily unavailable</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-body-gray">
          This document could not be loaded from the server right now. Please try again in a few
          minutes. If it still fails to load, ask the applicant to re-upload this document.
        </p>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {doc && (
        <DialogContent className="dlg-card-plain flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl" ariaLabel={`Document preview: ${doc.originalName}`}>
          <DialogHeader className="gap-0.5 border-b border-divider px-5 py-4 text-left sm:pr-14">
            <div className="flex min-w-0 items-center gap-3">
              <IconChip icon={missing ? FileWarning : FileText} tone={missing ? "amber" : "slate"} size={36} iconSize={16} />
              <div className="min-w-0 flex-1">
                <DialogTitle
                  className="truncate text-base font-medium text-ink sm:text-lg"
                  title={doc.originalName}
                >
                  {doc.originalName}
                </DialogTitle>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <DialogDescription className="num text-xs text-body-gray">
                    {humanize(doc.category)} · {Math.max(1, Math.round(doc.size / 1024))} KB · {formatDate(doc.createdAt)}
                  </DialogDescription>
                  {documentStatusChip(doc) && (
                    <StatusPill
                      status={documentStatusChip(doc)!.label}
                      variant={documentStatusChip(doc)!.variant}
                      pulse={documentStatusChip(doc)!.pulse}
                      className="cursor-default"
                    />
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {missing ? (
              missingCard
            ) : previewKind(doc) === "pdf" ? (
              <div className="relative h-[62vh] overflow-hidden rounded-lg border border-divider bg-white">
                {loading && (
                  <div className="absolute inset-0 z-10 grid place-items-center bg-white/80">
                    <Loader2 className="h-6 w-6 animate-spin text-stone" />
                  </div>
                )}
                {url && (
                  <iframe
                    src={url}
                    title={`Preview of ${doc.originalName}`}
                    className="h-full w-full"
                  />
                )}
              </div>
            ) : previewKind(doc) === "image" ? (
              <div className="relative grid min-h-[40vh] place-items-center overflow-hidden rounded-lg border border-divider bg-cloud/40 p-3">
                {loading && (
                  <div className="absolute inset-0 z-10 grid place-items-center bg-white/80">
                    <Loader2 className="h-6 w-6 animate-spin text-stone" />
                  </div>
                )}
                {url && (
                  <img
                    src={url}
                    alt={`Preview of ${doc.originalName}`}
                    className="max-h-[62vh] w-auto max-w-full rounded object-contain"
                    onError={markMissing}
                  />
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-divider bg-cloud/40 px-6 py-10 text-center">
                <IconChip icon={FileText} tone="slate" size={48} iconSize={20} />
                <div>
                  <p className="text-sm font-medium text-ink">No inline preview for {fileKind(doc.originalName)} files</p>
                  <p className="mt-1 text-xs text-body-gray">Download the file to view it on your device.</p>
                </div>
              </div>
            )}
          </div>

          {!missing && (
            <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-divider px-5 py-4">
              <a
                href={fileUrl(doc)}
                target="_blank"
                rel="noreferrer"
                className="dlg-ghost inline-flex min-h-[44px] items-center gap-2 px-5 py-2.5 text-sm"
              >
                <ExternalLink className="h-4 w-4" /> Open in new tab
              </a>
              <a
                href={fileUrl(doc)}
                download={doc.originalName}
                className="dlg-cta focus-ring inline-flex min-h-[44px] items-center gap-2 px-5 py-2.5 text-sm"
              >
                <Download className="h-4 w-4" /> Download
              </a>
            </DialogFooter>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}
