// ============================================================================
// RMIS — PDS/resume extraction pipeline (spec §6.4, §8.5, §8.6). APPLICANT-only.
// POST body { documentIds?, category? } — default targets = own UPLOADED docs
// in the 8 extractable categories. Marks all PROCESSING; responds with a
// STREAMING 200: "\n" keep-alive every 5 s (JSON.parse tolerates leading
// newlines) then the final JSON { results, merged }.
// Enterprise ops: documents are processed CONCURRENTLY (bounded to 4 — AI
// calls dominate latency, but an unbounded fan-out can stampede the extraction
// provider), each result
// carries the parser metadata + quality report computed by pds-validate, and
// the quality score is persisted on the Document row for analytics.
// Per-doc status: error → FAILED; 0 fields → FAILED (+ blank-CS-Form-212
// message); <3 fields → PARTIALLY_EXTRACTED; else EXTRACTED. merged =
// per-field highest-confidence merge across docs, quality-scored as a whole.
// ============================================================================

import { handleApi, ApiError } from "@/lib/api";
import { requireApplicantProfileAccess } from "@/lib/role-policy";
import { db } from "@/lib/db";
import { EXTRACTABLE_CATEGORIES } from "@/lib/validation";
import { DOC_STATUS, type DocumentStatus } from "@/lib/document-status";
import { extractFromDocument, countExtractedFields, mergeExtractions, type ExtractionResult } from "@/lib/pds-extract";
import { finalizeExtraction } from "@/lib/pds-validate";
import { resolveStoredFile } from "@/lib/upload-root";
// Task 81-e — the response wire types live in the PDS intake pipeline contract
// (lib/pds-pipeline.ts); the payload built below is annotated against them so
// server drift from the client contract is a compile error, not a silent one.
import type { PdsExtractResponse } from "@/lib/pds-pipeline";

type ExtractOutcome = {
  id: string;
  status: Extract<DocumentStatus, "EXTRACTED" | "PARTIALLY_EXTRACTED" | "FAILED">;
  fieldsExtracted: number;
  quality?: { score: number; grade: string; needsReview: number; issues: { severity: string; section: string; field: string; message: string }[] };
  meta?: ExtractionResult["meta"];
  extraction?: ExtractionResult;
  error?: string;
};

const BLANK_TEMPLATE_MESSAGE =
  "No recognizable data was found. If this is a blank CS Form 212 template, fill it in and re-upload. " +
  "Supported format: Excel PDS (.xlsx). " +
  "Files downloaded from Google Drive or SharePoint sometimes lose their data; use 'Download as .xlsx' and re-upload."

export const POST = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantProfileAccess(req, "applicant/documents/extract", "POST");

  const body = (await req.json().catch(() => ({}))) as { documentIds?: unknown; category?: unknown };
  const documentIds = Array.isArray(body.documentIds)
    ? body.documentIds.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    : null;
  const categoryOverride =
    typeof body.category === "string" && body.category.trim() !== "" ? body.category.trim() : null;

  const docs = documentIds && documentIds.length > 0
    ? // Explicit targets obey the SAME extractable-category fence as the
      // default path (audit 2026-10-22): the PDS pipeline must never run on
      // profile pictures or supporting files.
      await db.document.findMany({
        where: {
          applicantId: applicant.id,
          id: { in: documentIds },
          category: { in: [...EXTRACTABLE_CATEGORIES] },
        },
        orderBy: { createdAt: "asc" },
      })
    : await db.document.findMany({
        where: { applicantId: applicant.id, status: DOC_STATUS.UPLOADED, category: { in: [...EXTRACTABLE_CATEGORIES] } },
        orderBy: { createdAt: "asc" },
      });
  if (docs.length === 0) {
    throw new ApiError("No uploaded documents available for extraction", 404);
  }

  // Mark all targets PROCESSING before the (long-running) pipeline starts.
  await db.document.updateMany({
    where: { id: { in: docs.map((d) => d.id) } },
    data: { status: DOC_STATUS.PROCESSING },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode("\n"));
        } catch {
          closed = true;
          clearInterval(keepalive);
        }
      }, 5000);
      const finish = (payload: string) => {
        closed = true;
        clearInterval(keepalive);
        try {
          controller.enqueue(encoder.encode(payload));
          controller.close();
        } catch {
          // client already gone
        }
      };

      try {
        // Enterprise ops: process documents concurrently (AI calls dominate
        // latency; a serial loop makes multi-document uploads quadratic).
        const extractOne = async (doc: (typeof docs)[number]): Promise<ExtractOutcome> => {
          let status: ExtractOutcome["status"] = DOC_STATUS.FAILED;
          let fields = 0;
          let result: ExtractionResult | null = null;
          let error: string | undefined;

          try {
            // Task 73 — resolve across the persistent root (UPLOAD_DIR) and
            // legacy roots. A row without its bytes means the file was lost
            // to a rebuild of the old .next/standalone storage location.
            const absPath = resolveStoredFile(doc.filePath);
            if (!absPath) {
              status = DOC_STATUS.FAILED;
              error =
                "The file could not be reached on the server. Please re-upload this document.";
            } else {
              const outcome = await extractFromDocument(
                absPath,
                categoryOverride ?? doc.category,
                doc.mimeType
              );
              result = outcome.result;
              error = outcome.error;
            }
            fields = countExtractedFields(result);
            if (error) {
              status = DOC_STATUS.FAILED;
            } else if (fields === 0) {
              status = DOC_STATUS.FAILED;
              error = BLANK_TEMPLATE_MESSAGE;
            } else if (fields < 3) {
              status = DOC_STATUS.PARTIALLY_EXTRACTED;
            } else {
              status = DOC_STATUS.EXTRACTED;
            }
          } catch {
            status = DOC_STATUS.FAILED;
            error = "Extraction failed. Please try again.";
            result = null;
            fields = 0;
          }

          await db.document
            .update({
              where: { id: doc.id },
              data: {
                status,
                extractedJson: result ? JSON.stringify(result) : null,
                extractionError: error ?? null,
                extractedAt: new Date(),
                qualityScore: result?.quality?.score ?? null,
              },
            })
            .catch((e) => {
              // Persistence failure must be visible (e.g. stale Prisma client
              // after a schema push) — a silently PROCESSING row is an ops trap.
              console.error("[EXTRACT] Failed to persist extraction result:", e instanceof Error ? e.message : e);
            });

          return {
            id: doc.id,
            status,
            fieldsExtracted: fields,
            quality: result?.quality
              ? {
                  score: result.quality.score,
                  grade: result.quality.grade,
                  needsReview: result.quality.needsReview,
                  issues: result.quality.issues,
                }
              : undefined,
            meta: result?.meta,
            extraction: result ?? undefined,
            error,
          };
        };

        // Bounded pool (4): keeps the multi-document fan-out fast without
        // stampeding the extraction provider.
        const CONCURRENCY = 4;
        const results: ExtractOutcome[] = new Array(docs.length);
        let cursor = 0;
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, docs.length) }, async () => {
            while (true) {
              const index = cursor++;
              if (index >= docs.length) return;
              results[index] = await extractOne(docs[index]);
            }
          })
        );

        // merged = per-field highest-confidence merge across docs — but only
        // when it carries actual data. An empty merge (blank CS Form 212
        // template, hallucination-free AI nulls) must surface as null so
        // clients fall back to the per-document error messages.
        const mergedRaw = mergeExtractions(results.map((r) => r.extraction ?? null));
        const merged =
          mergedRaw && countExtractedFields(mergedRaw) > 0
            ? finalizeExtraction(mergedRaw, mergedRaw.meta ?? { parserPath: "hybrid", formRevision: null, durationMs: 0 })
            : null;
        const payload: PdsExtractResponse = { results, merged };
        finish(JSON.stringify(payload));
      } catch {
        finish(
          JSON.stringify(
            { results: [], merged: null, error: "Extraction failed. Please try again." } satisfies PdsExtractResponse,
          ),
        );
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
});
