"use client";

// ============================================================================
// RMIS — Route error boundary (audit 2026-10-22: an uncaught render error
// used to white-screen the whole SPA; Next.js needs this file to catch it).
// Offers a real recovery path (retry / home) instead of a dead screen.
// ============================================================================

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorBoundaryFallback({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for ops (the console is what a staff report quotes).
    console.error("[RMIS] Unhandled render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-amber-100 text-amber-700">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <div>
        <h1 className="text-lg font-medium text-ink">Something went wrong</h1>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-body-gray">
          The page hit an unexpected error. You can retry — if it keeps failing,
          go back to the home page and try again from there.
        </p>
        {error.digest ? (
          <p className="num mt-2 text-xs text-stone">Reference: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <RotateCcw className="size-4" aria-hidden /> Try again
        </button>
        <a
          href="/#/"
          className="inline-flex min-h-[44px] items-center rounded-full border border-border px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-cloud/50"
        >
          Go home
        </a>
      </div>
    </div>
  );
}
