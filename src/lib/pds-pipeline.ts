// ============================================================================
// RMIS — THE PDS INTAKE PIPELINE CONTRACT (spec §7.5, §8.4). Client-safe.
// The applicant-side intake flow is CLIENT-ORCHESTRATED, three steps:
//   1. UPLOAD      POST /api/applicant/documents            (multipart) → 201 document row
//   2. EXTRACT     POST /api/applicant/documents/extract    ({documentIds}) → 200 {results, merged}
//   3. AUTO-APPLY  POST /api/applicant/profile/auto-apply   ({extraction}) → 200 apply counts
// This module is the ONE home for that pipeline's wire contract and runner —
// previously the response types were hand-declared in pds-upload-card.tsx
// (a drifting copy of what the routes actually build). Honesty rules:
//   • PdsAutoApplyRequest / PdsExtractionSections are DERIVED from the route's
//     own Zod schema (lib/validation autoApplySchema) via z.infer;
//   • the extract + auto-apply routes type their payloads against THIS
//     module's response types, so server drift is a compile error;
//   • no third copy exists — callers import from here.
// Task 78 fences this contract sits on (obeyed, never duplicated):
//   • extract targets are fenced to EXTRACTABLE_CATEGORIES (validation.ts);
//   • extraction runs server-side with a bounded pool of 4 (extract route);
//   • the ONE-EXTRACTION LOCK is expressed with the DOC_STATUS vocabulary
//     (document-status.ts) — see isPdsExtractionLocked below.
// ============================================================================

import { z } from "zod";
import { autoApplySchema, EXTRACTABLE_CATEGORIES } from "@/lib/validation";
import { DOC_STATUS } from "@/lib/document-status";
import type { DocumentWire } from "@/lib/router";
import type { ProfileCompletion } from "@/lib/profile-completeness";
import { apiFetch, apiUpload } from "@/lib/client";

// ── Step 1 — upload (POST /api/applicant/documents, multipart) ──────────────

/** The pipeline's upload category (multipart `category` field). */
export const PDS_CATEGORY = "PDS";

/** PDS upload surface — Excel-only per product decision (.xlsx CS Form 212;
    PDF/DOCX/image extraction is not offered). The server's general §10
    allowlist stays broader as a backstop; the 10 MB cap mirrors it
    client-side. MUST be comma-separated (UploadCN's parseAccept contract). */
export const PDS_UPLOAD_ACCEPT = ".xlsx,.xls,.xlsm";
export const PDS_UPLOAD_MAX_SIZE = 10 * 1024 * 1024;

/** 201 response — the created document row (the canonical DocumentWire
    projection; the route returns the raw row, a JSON superset). */
export type PdsUploadResponse = DocumentWire;

// ── Shared extraction shapes ────────────────────────────────────────────────

/** The extraction payload the auto-apply route's Zod schema accepts
    (lib/validation autoApplySchema — sections are {value, confidence}
    records the server reads defensively). */
export type PdsExtractionSections = z.infer<typeof autoApplySchema>["extraction"];

/** Parser observability attached to extract results and the merge. */
export type PdsExtractionMeta = {
  parserPath: string;
  formRevision: string | null;
  durationMs: number;
};

/** One checker note from pds-validate ("needs review" lines). */
export type PdsExtractionIssue = {
  severity: string;
  section: string;
  field: string;
  message: string;
};

/** Quality report as the extract route actually ships it (scored by
    pds-validate; the per-result wire copy omits fieldsExtracted). */
export type PdsExtractionQuality = {
  score: number;
  grade: string;
  needsReview: number;
  issues: PdsExtractionIssue[];
};

/** A merged/passed-through extraction: the schema sections plus the
    server-attached meta + quality the client renders. */
export type PdsExtraction = PdsExtractionSections & {
  meta?: PdsExtractionMeta;
  quality?: PdsExtractionQuality;
};

// ── Step 2 — extract (POST /api/applicant/documents/extract) ────────────────

/** Extract body. The route hand-parses leniently (non-string ids filtered,
    absent ids → the applicant's own UPLOADED docs in the extractable
    categories); this is the shape the pipeline sends. */
export type PdsExtractRequest = {
  documentIds: string[];
  /** Parser category override — the pipeline never sends one. */
  category?: string;
};

/** Terminal per-document extraction status (DOC_STATUS vocabulary). */
export type PdsExtractionStatus = "EXTRACTED" | "PARTIALLY_EXTRACTED" | "FAILED";

/** One document's extraction outcome. */
export type PdsExtractOutcome = {
  id: string;
  status: PdsExtractionStatus;
  fieldsExtracted: number;
  quality?: PdsExtractionQuality;
  meta?: PdsExtractionMeta;
  extraction?: PdsExtraction;
  error?: string;
};

/** The extract endpoint's response — a STREAMING 200 ("\n" keep-alive bytes
    every 5 s, tolerated by apiFetch's JSON.parse) ending in this JSON. */
export type PdsExtractResponse = {
  results: PdsExtractOutcome[];
  /** Per-field highest-confidence merge across documents — null when nothing
      usable was read (clients fall back to the per-document error messages). */
  merged: PdsExtraction | null;
  /** Catastrophic-path marker (pipeline failure after processing started). */
  error?: string;
};

// ── Step 3 — auto-apply (POST /api/applicant/profile/auto-apply) ────────────

/** Auto-apply body — DERIVED from the route's own Zod schema, not re-declared. */
export type PdsAutoApplyRequest = z.infer<typeof autoApplySchema>;

/** Auto-apply response (§8.4 semantics: personal info is an OVERRIDE
    allowlist, each section is REPLACE only when the extraction carries ≥ 1
    entry). profileCompletion is the recomputed §7.4 completion gate. */
export type PdsAutoApplyResponse = {
  applied: {
    personal: number;
    education: number;
    work: number;
    training: number;
    eligibility: number;
    awards: number;
  };
  replaced: { personal: number };
  totalFilled: number;
  totalReplaced: number;
  profileCompletion: ProfileCompletion;
  message: string;
};

// ── The ONE-EXTRACTION LOCK (spec §7.5) ─────────────────────────────────────
// Once ANY extractable-category document (Task 78 fence: EXTRACTABLE_CATEGORIES)
// reaches EXTRACTED / PARTIALLY_EXTRACTED (DOC_STATUS vocabulary), the PDS
// dropzone is replaced by the locked strip; the only way back is
// "Clear Forms & Re-upload" → confirm → POST /api/applicant/profile/clear
// (files stay). THE client-side derivation of that state — one expression,
// not a per-component re-derivation.

const EXTRACTABLE = EXTRACTABLE_CATEGORIES as readonly string[];

export function isPdsExtractionLocked(
  docs: readonly Pick<DocumentWire, "category" | "status">[],
): boolean {
  return docs.some(
    (d) =>
      EXTRACTABLE.includes(d.category) &&
      (d.status === DOC_STATUS.EXTRACTED || d.status === DOC_STATUS.PARTIALLY_EXTRACTED),
  );
}

// ── The typed 3-step runner ─────────────────────────────────────────────────

export type PdsPipelinePhase = "uploading" | "extracting" | "applying";

export type PdsPipelineResult = {
  /** Step 1's created document row (201). */
  document: PdsUploadResponse;
  /** Step 2's full payload (results + merged). */
  extraction: PdsExtractResponse;
  /** Step 3's apply counts (200). */
  applied: PdsAutoApplyResponse;
};

/** Fallback error when extraction produced no usable merge and no per-document
    error carried a message (the pipeline's own error envelope). */
export const PDS_EXTRACT_FAILED_FALLBACK =
  "Extraction failed. Try a filled PDS file: Excel CS Form 212 (.xlsx).";

/**
 * Run the whole intake pipeline for ONE file: upload (category PDS) →
 * extract → auto-apply. Throws (Error with the server's message, or the
 * fallback above) when extraction yields no usable merge or any call fails —
 * callers own the UI state around it.
 */
export async function runPdsPipeline(
  file: File,
  opts: {
    /** Byte progress of step 1 (the UploadCN adapter contract). */
    onProgress?: (loaded: number, total: number) => void;
    /** Phase transitions, in run order: uploading → extracting → applying. */
    onPhase?: (phase: PdsPipelinePhase) => void;
    /** Fires when step 2 lands, BEFORE step 3 runs (lets a caller render the
        merged quality while the apply request is in flight). */
    onExtracted?: (extraction: PdsExtractResponse) => void;
  } = {},
): Promise<PdsPipelineResult> {
  // 1 — Upload (category PDS). 201 → the created document row.
  opts.onPhase?.("uploading");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("category", PDS_CATEGORY);
  const document = await apiUpload<PdsUploadResponse>("/api/applicant/documents", fd, {
    onProgress: opts.onProgress,
  });

  // 2 — Extract (streaming endpoint; apiFetch tolerates keep-alive bytes).
  opts.onPhase?.("extracting");
  const extraction = await apiFetch<PdsExtractResponse>("/api/applicant/documents/extract", {
    method: "POST",
    body: { documentIds: [document.id] } satisfies PdsExtractRequest,
  });
  if (!extraction.merged) {
    const failed = extraction.results?.find((r) => r.error);
    throw new Error(failed?.error ?? PDS_EXTRACT_FAILED_FALLBACK);
  }
  opts.onExtracted?.(extraction);

  // 3 — Auto-apply (§8.4: personal overrides, sections replace).
  opts.onPhase?.("applying");
  const applied = await apiFetch<PdsAutoApplyResponse>("/api/applicant/profile/auto-apply", {
    method: "POST",
    body: { extraction: extraction.merged } satisfies PdsAutoApplyRequest,
  });

  return { document, extraction, applied };
}
