"use client";

// ============================================================================
// RMIS — Global error boundary (audit 2026-10-22): last-resort catch for
// errors thrown OUTSIDE the route tree (layout/provider failures). Owns its
// own <html> so it renders even when the root layout crashed. A reload is
// the only recovery when the shell itself is broken.
// ============================================================================

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RMIS] Global render error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          fontFamily: "system-ui, sans-serif",
          background: "#fafaf9",
          color: "#1f2025",
          padding: 24,
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>
          RMIS could not start
        </h1>
        <p style={{ fontSize: 14, color: "#6b6a76", maxWidth: 420, lineHeight: 1.6 }}>
          A critical error prevented the application shell from loading. Reload
          the page — if the problem persists, contact the system administrator
          {error.digest ? ` and quote reference ${error.digest}` : ""}.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: 44,
            padding: "10px 24px",
            borderRadius: 999,
            border: "none",
            background: "#1f2025",
            color: "#fff",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
